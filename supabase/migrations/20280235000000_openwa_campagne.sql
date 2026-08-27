-- Campagne WhatsApp Locale: cold su lista con follow-up, a ritmo umano.
--
-- Il canale OpenWA aveva l'invio singolo (automazioni trigger-based) e un
-- anti-ban serio per numero (warm-up, throttle, cap giorno/settimana,
-- rotazione least-loaded), ma NON aveva il livello "prendi questi 500
-- prospect e contattali a 10 al giorno per numero, poi risollecita chi non
-- risponde". Si sarebbe dovuto costruire a mano, automazione per automazione.
--
-- Qui il livello mancante. Nessuna logica anti-ban duplicata: il dispatcher
-- chiede un invio a sendOpenWaMessage e se il pool e' esaurito (409) si ferma
-- e riprende al giro dopo. Il ritmo vero lo decidono sempre i cap dei numeri.

CREATE TABLE IF NOT EXISTS public.openwa_campagne (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  stato text NOT NULL DEFAULT 'bozza'
    CHECK (stato IN ('bozza','in_corso','in_pausa','completata','annullata')),

  -- Il messaggio a freddo. Supporta spintax {ciao|salve} e i segnaposto
  -- gia' noti a resolveContactText ({{nome}}, {{azienda}}, …).
  messaggio text NOT NULL,

  -- Follow-up: uno solo, dopo N giorni, SOLO a chi non ha risposto.
  -- NULL = nessun follow-up.
  followup_messaggio text,
  followup_dopo_giorni integer NOT NULL DEFAULT 3
    CHECK (followup_dopo_giorni BETWEEN 1 AND 30),

  -- Restringe la scelta ai numeri che condividono almeno uno di questi tag.
  -- ATTENZIONE alla semantica ereditata da openwaPickNumber: un numero SENZA
  -- tag e' jolly e resta sempre idoneo. Per riservare una campagna a numeri
  -- precisi, quei numeri vanno taggati E gli altri non devono restare senza tag.
  tags_numeri text[] NOT NULL DEFAULT '{}',

  creata_da uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  avviata_at timestamptz,
  completata_at timestamptz
);

COMMENT ON TABLE public.openwa_campagne IS
  'Campagne cold WhatsApp Locale (solo piattaforma). Il ritmo NON si configura qui: lo impongono i cap per numero in openwa_numbers (warm-up, daily_cap, weekly_cap, min_gap_seconds).';

-- Un destinatario per riga: e' la coda di lavoro e insieme lo storico.
CREATE TABLE IF NOT EXISTS public.openwa_campagna_destinatari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campagna_id uuid NOT NULL REFERENCES public.openwa_campagne(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,

  stato text NOT NULL DEFAULT 'da_inviare'
    CHECK (stato IN ('da_inviare','inviato','followup_inviato','risposto','saltato','fallito')),

  primo_inviato_at timestamptz,
  followup_inviato_at timestamptz,
  risposto_at timestamptz,
  ultimo_errore text,
  tentativi integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Lo stesso contatto non entra due volte nella stessa campagna.
  UNIQUE (campagna_id, contact_id)
);

-- La coda di lavoro si legge sempre "cosa tocca adesso": indice mirato.
CREATE INDEX IF NOT EXISTS idx_openwa_dest_lavoro
  ON public.openwa_campagna_destinatari (campagna_id, stato);
-- Il webhook cerca per contatto quando arriva una risposta.
CREATE INDEX IF NOT EXISTS idx_openwa_dest_contatto
  ON public.openwa_campagna_destinatari (contact_id)
  WHERE stato IN ('inviato','followup_inviato');

ALTER TABLE public.openwa_campagne ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.openwa_campagna_destinatari ENABLE ROW LEVEL SECURITY;

-- Come tutto il canale OpenWA: solo staff di piattaforma. Mai le aziende.
DROP POLICY IF EXISTS openwa_campagne_platform ON public.openwa_campagne;
CREATE POLICY openwa_campagne_platform ON public.openwa_campagne
  FOR ALL TO authenticated
  USING (public.is_platform_staff()) WITH CHECK (public.is_platform_staff());

DROP POLICY IF EXISTS openwa_dest_platform ON public.openwa_campagna_destinatari;
CREATE POLICY openwa_dest_platform ON public.openwa_campagna_destinatari
  FOR ALL TO authenticated
  USING (public.is_platform_staff()) WITH CHECK (public.is_platform_staff());

-- ── Chi tocca adesso ────────────────────────────────────────────────────────
-- Restituisce i destinatari maturi, primo contatto e follow-up insieme, in
-- ordine di anzianita'. Il dispatcher ne prende un po' per volta e si ferma
-- quando i numeri sono esauriti: il limite vero e' il pool, non questa query.
CREATE OR REPLACE FUNCTION public.openwa_campagna_prossimi(p_limit integer DEFAULT 50)
RETURNS TABLE(
  destinatario_id uuid,
  campagna_id uuid,
  contact_id uuid,
  tipo text,
  messaggio text,
  tags_numeri text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Primo contatto: mai inviato.
  (SELECT d.id, d.campagna_id, d.contact_id, 'primo'::text, c.messaggio, c.tags_numeri
   FROM public.openwa_campagna_destinatari d
   JOIN public.openwa_campagne c ON c.id = d.campagna_id
   JOIN public.marketing_contacts mc ON mc.id = d.contact_id
   WHERE c.stato = 'in_corso'
     AND d.stato = 'da_inviare'
     AND d.tentativi < 5
     AND mc.optout_whatsapp IS NOT TRUE
     AND mc.phone IS NOT NULL
   ORDER BY d.created_at
   LIMIT p_limit)
  UNION ALL
  -- Follow-up: inviato da abbastanza tempo e SENZA risposta. La condizione
  -- "non ha risposto" e' nello stato: chi risponde diventa 'risposto' e sparisce
  -- da qui. Insistere con chi ha gia' risposto e' il modo piu' rapido di farsi
  -- segnalare come spam.
  (SELECT d.id, d.campagna_id, d.contact_id, 'followup'::text, c.followup_messaggio, c.tags_numeri
   FROM public.openwa_campagna_destinatari d
   JOIN public.openwa_campagne c ON c.id = d.campagna_id
   JOIN public.marketing_contacts mc ON mc.id = d.contact_id
   WHERE c.stato = 'in_corso'
     AND d.stato = 'inviato'
     AND c.followup_messaggio IS NOT NULL
     AND d.primo_inviato_at < now() - make_interval(days => c.followup_dopo_giorni)
     AND d.tentativi < 5
     AND mc.optout_whatsapp IS NOT TRUE
     AND mc.phone IS NOT NULL
   ORDER BY d.primo_inviato_at
   LIMIT p_limit);
$function$;

REVOKE ALL ON FUNCTION public.openwa_campagna_prossimi(integer) FROM PUBLIC, anon, authenticated;

-- ── Una risposta chiude il contatto in TUTTE le campagne attive ─────────────
-- Chiamata dal webhook OpenWA quando arriva un inbound.
CREATE OR REPLACE FUNCTION public.openwa_campagna_segna_risposta(p_contact_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH agg AS (
    UPDATE public.openwa_campagna_destinatari
    SET stato = 'risposto', risposto_at = now()
    WHERE contact_id = p_contact_id
      AND stato IN ('inviato','followup_inviato')
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::integer FROM agg;
$function$;

REVOKE ALL ON FUNCTION public.openwa_campagna_segna_risposta(uuid) FROM PUBLIC, anon, authenticated;

-- ── Completamento automatico ────────────────────────────────────────────────
-- Una campagna e' finita quando non resta niente da fare: nessun primo invio
-- pendente e nessun follow-up ancora possibile.
CREATE OR REPLACE FUNCTION public.openwa_campagne_completa_finite()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH agg AS (
    UPDATE public.openwa_campagne c
    SET stato = 'completata', completata_at = now(), updated_at = now()
    WHERE c.stato = 'in_corso'
      AND NOT EXISTS (
        SELECT 1 FROM public.openwa_campagna_destinatari d
        WHERE d.campagna_id = c.id
          AND (
            (d.stato = 'da_inviare' AND d.tentativi < 5)
            OR (d.stato = 'inviato' AND c.followup_messaggio IS NOT NULL AND d.tentativi < 5)
          )
      )
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::integer FROM agg;
$function$;

REVOKE ALL ON FUNCTION public.openwa_campagne_completa_finite() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
