-- Le caselle collegate morivano in silenzio.
--
-- Due Gmail sono rimaste scollegate da giugno a settembre senza che nessuno se
-- ne accorgesse: `invalid_grant`, status `expired`, e l'unico segnale era una
-- riga rossa con dentro il testo grezzo di Google, in una scheda che nessuno
-- apre. Nel frattempo la posta non arrivava più e l'AI leggeva il vuoto.
--
-- Due cose cambiano qui.
--
-- 1. CHI HA COLLEGATO LA CASELLA VIENE AVVISATO. Quando una connessione passa a
--    «scaduta» o «in errore» il proprietario riceve un avviso in campanella, al
--    massimo uno a settimana per casella, scritto in italiano e con il link alla
--    pagina dove si ricollega. È lo stesso trattamento già dato ai calendari.
--
-- 2. LE PASSWORD IMAP SBAGLIATE SMETTONO DI ESSERE RIPROVATE ALL'INFINITO. Un
--    `AUTHENTICATIONFAILED` di Aruba o Register non è un intoppo passeggero: la
--    password è cambiata, e ritentarla ogni dieci minuti per sempre — come
--    faceva — porta al blocco dell'account da parte del provider. Ora vale come
--    errore definitivo: la casella si ferma e chiede di essere sistemata.

CREATE OR REPLACE FUNCTION public.email_oauth_mark_sync(
  p_connection_id uuid,
  p_success boolean,
  p_emails_fetched integer DEFAULT 0,
  p_error text DEFAULT NULL::text,
  p_provider_metadata jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stato_prima TEXT;
  v_conn RECORD;
  v_gia_avvisato BOOLEAN;
  v_titolo TEXT;
  v_testo TEXT;
BEGIN
  IF p_success THEN
    UPDATE public.email_oauth_connections
       SET last_synced_at = now(),
           last_sync_error = NULL,
           consecutive_errors = 0,
           emails_fetched_total = emails_fetched_total + GREATEST(p_emails_fetched, 0),
           provider_metadata = COALESCE(p_provider_metadata, provider_metadata),
           status = CASE WHEN status IN ('error', 'expired') THEN 'active' ELSE status END
     WHERE id = p_connection_id;
    RETURN;
  END IF;

  SELECT status INTO v_stato_prima
    FROM public.email_oauth_connections
   WHERE id = p_connection_id;

  UPDATE public.email_oauth_connections
     SET last_synced_at = now(),
         last_sync_error = LEFT(COALESCE(p_error, 'unknown'), 500),
         consecutive_errors = consecutive_errors + 1,
         status = CASE
           -- OAuth: l'utente ha tolto l'autorizzazione, o il token è marcito.
           WHEN COALESCE(p_error, '') ~* '(refresh_token_missing|invalid_grant|invalid_client|unauthorized_client|invalid_token)'
             THEN 'expired'
           -- IMAP/SMTP: la password non è più quella. Ritentarla porta al blocco
           -- dell'account, non a un lieto fine.
           WHEN COALESCE(p_error, '') ~* '(authenticationfailed|authentication failed|authentication unsuccessful|invalid credentials|login failed|535 5\.7|534 5\.7|password (is )?incorrect)'
             THEN 'expired'
           WHEN consecutive_errors + 1 >= 5 THEN 'error'
           ELSE status
         END
   WHERE id = p_connection_id
   RETURNING id, company_id, user_id, provider, email_address, status
        INTO v_conn;

  -- Avviso solo al passaggio di stato: finché la casella era già ferma, chi l'ha
  -- collegata lo sa già (e un avviso ogni dieci minuti sarebbe rumore).
  IF v_conn.id IS NULL
     OR v_conn.user_id IS NULL
     OR v_conn.company_id IS NULL
     OR v_conn.status NOT IN ('expired', 'error')
     OR v_stato_prima = v_conn.status THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.entity_type = 'email_oauth_connection'
       AND n.entity_id = v_conn.id
       AND n.created_at > now() - interval '7 days'
  ) INTO v_gia_avvisato;
  IF v_gia_avvisato THEN
    RETURN;
  END IF;

  IF v_conn.provider = 'imap' THEN
    v_titolo := 'La casella ' || v_conn.email_address || ' non risponde più';
    v_testo := 'Il server di posta rifiuta le credenziali: di solito è la password, cambiata o scaduta. '
      || 'Finché non la reinserisci non arriva più niente in Edilizia in Cloud e non si può inviare da questo indirizzo. '
      || 'Si rimette da Impostazioni → Mio profilo → Email.';
  ELSE
    v_titolo := 'Il collegamento a ' || v_conn.email_address || ' si è interrotto';
    v_testo := CASE WHEN v_conn.provider = 'outlook' THEN 'Microsoft ' ELSE 'Google ' END
      || 'non autorizza più Edilizia in Cloud a leggere questa casella: la posta non arriva più e non si può inviare da questo indirizzo. '
      || 'Bastano due clic per ricollegarla, da Impostazioni → Mio profilo → Email.';
  END IF;

  INSERT INTO public.notifications (
    company_id, user_id, type, title, body, entity_type, entity_id, action_url
  ) VALUES (
    v_conn.company_id, v_conn.user_id, 'email_alert', v_titolo, v_testo,
    'email_oauth_connection', v_conn.id,
    -- Il team di piattaforma vive sotto /admin: mandarlo su /azienda gli
    -- farebbe trovare una pagina che non è la sua.
    CASE WHEN v_conn.company_id = '00000000-0000-0000-0000-000000000001'::uuid
         THEN '/admin/impostazioni/mio-profilo?tab=email'
         ELSE '/azienda/impostazioni/mio-profilo?tab=email'
    END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.email_oauth_mark_sync(uuid, boolean, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_oauth_mark_sync(uuid, boolean, integer, text, jsonb) TO authenticated, service_role;
