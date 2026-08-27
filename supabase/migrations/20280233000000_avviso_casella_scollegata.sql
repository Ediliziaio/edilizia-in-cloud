-- La casella scollegata e' un problema DELL'AZIENDA, non del super-admin.
--
-- Quando il token Gmail/Outlook di un'azienda scade, il poller incrementa
-- consecutive_errors e finisce li': nessuno avvisa nessuno. Il problema
-- diventava visibile solo nel rapporto di piattaforma — cioe' a chi NON puo'
-- risolverlo, perche' riconnettere richiede il login Google dell'azienda.
-- Con due caselle si sopporta; con quaranta il rapporto diventa una lista di
-- cose che il super-admin non puo' toccare, e a quel punto smette di leggerlo.
--
-- Qui: i candidati da avvisare. L'email la manda system-emails-tick (che ha
-- gia' l'anti-doppione su system_email_sends), all'indirizzo dell'azienda.

-- Quando abbiamo avvisato l'ultima volta per QUESTA connessione. Serve a
-- ri-avvisare se si riscollega e poi si rompe di nuovo, senza spammare nel
-- frattempo (il poller gira ogni 2 minuti: senza guardia sarebbe un disastro).
ALTER TABLE public.email_oauth_connections
  ADD COLUMN IF NOT EXISTS scollegata_avvisata_at timestamptz;

COMMENT ON COLUMN public.email_oauth_connections.scollegata_avvisata_at IS
  'Ultimo avviso "casella scollegata" mandato all''azienda. Azzerato quando la connessione torna a funzionare, cosi'' un nuovo guasto genera un nuovo avviso.';

-- Cambiano le colonne restituite rispetto alla prima stesura: serve il drop.
DROP FUNCTION IF EXISTS public.email_connessioni_da_avvisare(integer);

CREATE OR REPLACE FUNCTION public.email_connessioni_da_avvisare(p_min_ore integer DEFAULT 6)
RETURNS TABLE(
  connection_id uuid,
  company_id uuid,
  company_name text,
  destinatario text,
  nome_destinatario text,
  email_address text,
  provider text,
  motivo text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.company_id,
    co.name,
    -- Chi ha COLLEGATO la casella: e' l'unico che puo' riconnetterla, perche'
    -- serve il suo login Google/Microsoft. Ripiego sull'admin dell'azienda.
    -- NON si usa companies.email: e' inaffidabile (verificato 2026-08-27:
    -- "Demo Azienda" porta l'indirizzo di Domus Group, un'azienda diversa —
    -- avvisare li' significherebbe scrivere a un cliente che non c'entra).
    COALESCE(
      prop.email,
      (SELECT p2.email FROM public.profiles p2
       JOIN public.user_roles ur ON ur.user_id = p2.id
       WHERE p2.company_id = c.company_id AND ur.role = 'company_admin'
       ORDER BY p2.created_at LIMIT 1)
    ),
    COALESCE(NULLIF(TRIM(COALESCE(prop.first_name,'') || ' ' || COALESCE(prop.last_name,'')), ''), 'ciao'),
    c.email_address,
    c.provider,
    CASE
      WHEN c.expires_at IS NOT NULL AND c.expires_at < now() THEN 'token scaduto'
      ELSE 'errori ripetuti di sincronizzazione'
    END
  FROM public.email_oauth_connections c
  JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN public.profiles prop ON prop.id = c.user_id
  WHERE c.poll_enabled
    AND (
      (c.expires_at IS NOT NULL AND c.expires_at < now())
      OR c.consecutive_errors >= 5
    )
    AND c.updated_at < now() - make_interval(hours => p_min_ore)
    AND (c.scollegata_avvisata_at IS NULL OR c.scollegata_avvisata_at < c.updated_at)
    AND COALESCE(
      prop.email,
      (SELECT p2.email FROM public.profiles p2
       JOIN public.user_roles ur ON ur.user_id = p2.id
       WHERE p2.company_id = c.company_id AND ur.role = 'company_admin'
       ORDER BY p2.created_at LIMIT 1)
    ) IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.email_connessioni_da_avvisare(integer) FROM PUBLIC, anon, authenticated;

-- Segna l'avviso come mandato (la chiama la edge dopo l'invio riuscito).
CREATE OR REPLACE FUNCTION public.email_connessione_avvisata(p_connection_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.email_oauth_connections
  SET scollegata_avvisata_at = now()
  WHERE id = p_connection_id;
$function$;

REVOKE ALL ON FUNCTION public.email_connessione_avvisata(uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
