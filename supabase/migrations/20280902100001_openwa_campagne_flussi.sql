-- Flussi WhatsApp Locale personalizzabili (02/09/2026): orario e giorni di
-- invio PER campagna, scadenza, tetto giornaliero per campagna, variabili
-- personalizzate e "ferma se risponde" disattivabile.
ALTER TABLE public.openwa_campagne
  ADD COLUMN IF NOT EXISTS orario_da smallint,
  ADD COLUMN IF NOT EXISTS orario_a smallint,
  ADD COLUMN IF NOT EXISTS giorni_settimana smallint[],
  ADD COLUMN IF NOT EXISTS scadenza_il timestamptz,
  ADD COLUMN IF NOT EXISTS max_al_giorno integer,
  ADD COLUMN IF NOT EXISTS inviati_oggi integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inviati_oggi_data date,
  ADD COLUMN IF NOT EXISTS variabili jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stop_se_risponde boolean NOT NULL DEFAULT true;
ALTER TABLE public.openwa_campagne DROP CONSTRAINT IF EXISTS openwa_campagne_orario_chk;
ALTER TABLE public.openwa_campagne ADD CONSTRAINT openwa_campagne_orario_chk CHECK (
  (orario_da IS NULL OR orario_da BETWEEN 0 AND 23) AND (orario_a IS NULL OR orario_a BETWEEN 1 AND 24)
  AND (orario_da IS NULL OR orario_a IS NULL OR orario_da < orario_a)
  AND (max_al_giorno IS NULL OR max_al_giorno > 0));
COMMENT ON COLUMN public.openwa_campagne.giorni_settimana IS '1 = lunedi'' … 7 = domenica; NULL/vuoto = finestra globale';
COMMENT ON COLUMN public.openwa_campagne.variabili IS 'Variabili personalizzate della campagna: {"offerta": "…"} → {{offerta}} nei testi';

-- Tetto giornaliero per campagna, contato in modo atomico PRIMA dell'invio.
CREATE OR REPLACE FUNCTION public.openwa_campagna_conta_invio(p_campagna_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$
  WITH oggi AS (SELECT (now() at time zone 'Europe/Rome')::date d),
  u AS (
    UPDATE public.openwa_campagne c
    SET inviati_oggi = CASE WHEN c.inviati_oggi_data = (SELECT d FROM oggi) THEN c.inviati_oggi + 1 ELSE 1 END,
        inviati_oggi_data = (SELECT d FROM oggi)
    WHERE c.id = p_campagna_id
      AND (c.max_al_giorno IS NULL OR c.inviati_oggi_data IS DISTINCT FROM (SELECT d FROM oggi) OR c.inviati_oggi < c.max_al_giorno)
    RETURNING c.id)
  SELECT EXISTS (SELECT 1 FROM u);
$f$;
CREATE OR REPLACE FUNCTION public.openwa_campagna_scala_invio(p_campagna_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$
  UPDATE public.openwa_campagne SET inviati_oggi = GREATEST(0, inviati_oggi - 1)
  WHERE id = p_campagna_id AND inviati_oggi_data = (now() at time zone 'Europe/Rome')::date;
$f$;
REVOKE ALL ON FUNCTION public.openwa_campagna_conta_invio(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.openwa_campagna_scala_invio(uuid) FROM PUBLIC, anon, authenticated;

-- Prossimi invii: rispettano i tempi della campagna.
CREATE OR REPLACE FUNCTION public.openwa_campagna_prossimi(p_limit integer DEFAULT 40)
RETURNS TABLE(destinatario_id uuid, campagna_id uuid, contact_id uuid, tipo text, messaggio text, tags_numeri text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  RETURN QUERY
  WITH maturi AS (
    SELECT d.id,
      CASE d.stato WHEN 'da_inviare' THEN 'primo' WHEN 'inviato' THEN 'followup'
                   WHEN 'followup_inviato' THEN 'followup2' ELSE 'followup3' END AS tipo,
      CASE d.stato WHEN 'da_inviare' THEN d.created_at
                   WHEN 'inviato' THEN d.primo_inviato_at + make_interval(days => c.followup_dopo_giorni)
                   WHEN 'followup_inviato' THEN d.followup_inviato_at + make_interval(days => c.followup2_dopo_giorni)
                   ELSE d.followup2_inviato_at + make_interval(days => c.followup3_dopo_giorni) END AS scadenza
    FROM public.openwa_campagna_destinatari d
    JOIN public.openwa_campagne c ON c.id = d.campagna_id
    JOIN public.marketing_contacts mc ON mc.id = d.contact_id
    WHERE c.stato = 'in_corso' AND (c.parte_il IS NULL OR c.parte_il <= now())
      -- Tempi della campagna (ora di Roma): scadenza, fascia oraria, giorni,
      -- tetto giornaliero. NULL = vale la finestra globale anti-ban.
      AND (c.scadenza_il IS NULL OR c.scadenza_il > now())
      AND (c.orario_da IS NULL OR extract(hour from (now() at time zone 'Europe/Rome')) >= c.orario_da)
      AND (c.orario_a IS NULL OR extract(hour from (now() at time zone 'Europe/Rome')) < c.orario_a)
      AND (c.giorni_settimana IS NULL OR cardinality(c.giorni_settimana) = 0
           OR extract(isodow from (now() at time zone 'Europe/Rome'))::int = ANY (c.giorni_settimana))
      AND (c.max_al_giorno IS NULL OR c.inviati_oggi_data IS DISTINCT FROM (now() at time zone 'Europe/Rome')::date
           OR c.inviati_oggi < c.max_al_giorno)
      AND d.tentativi < 5
      AND (d.claimed_at IS NULL OR d.claimed_at < now() - interval '15 minutes')
      AND mc.optout_whatsapp IS NOT TRUE AND public.openwa_norm_tel(mc.phone) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.marketing_contacts o
        WHERE o.company_id = mc.company_id AND o.optout_whatsapp IS TRUE
          AND public.openwa_norm_tel(o.phone) = public.openwa_norm_tel(mc.phone))
      AND (
        d.stato = 'da_inviare'
        OR (d.stato = 'inviato' AND NULLIF(btrim(c.followup_messaggio), '') IS NOT NULL
            AND d.primo_inviato_at < now() - make_interval(days => c.followup_dopo_giorni))
        OR (d.stato = 'followup_inviato' AND NULLIF(btrim(c.followup2_messaggio), '') IS NOT NULL
            AND d.followup_inviato_at < now() - make_interval(days => c.followup2_dopo_giorni))
        OR (d.stato = 'followup2_inviato' AND NULLIF(btrim(c.followup3_messaggio), '') IS NOT NULL
            AND d.followup2_inviato_at < now() - make_interval(days => c.followup3_dopo_giorni)))
  ), scelti AS (
    SELECT dd.id FROM public.openwa_campagna_destinatari dd
    WHERE dd.id IN (SELECT m.id FROM maturi m ORDER BY (m.tipo = 'primo'), m.scadenza LIMIT p_limit)
    FOR UPDATE SKIP LOCKED
  ), claim AS (
    UPDATE public.openwa_campagna_destinatari du SET claimed_at = now()
    FROM scelti s WHERE du.id = s.id
    RETURNING du.id, du.campagna_id, du.contact_id
  )
  SELECT cl.id, cl.campagna_id, cl.contact_id, m.tipo,
    CASE m.tipo WHEN 'primo' THEN c.messaggio WHEN 'followup' THEN c.followup_messaggio
                WHEN 'followup2' THEN c.followup2_messaggio ELSE c.followup3_messaggio END,
    c.tags_numeri
  FROM claim cl
  JOIN maturi m ON m.id = cl.id
  JOIN public.openwa_campagne c ON c.id = cl.campagna_id
  ORDER BY (m.tipo = 'primo'), m.scadenza;
END; $f$;

-- "Ferma se risponde" disattivabile: la risposta viene comunque registrata,
-- ma la sequenza continua per le campagne che lo chiedono.
CREATE OR REPLACE FUNCTION public.openwa_campagna_segna_risposta(p_contact_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$
  WITH agg AS (
    UPDATE public.openwa_campagna_destinatari d
    SET stato = 'risposto', risposto_at = now(), claimed_at = NULL
    FROM public.openwa_campagne c
    WHERE c.id = d.campagna_id AND c.stop_se_risponde
      AND d.contact_id = p_contact_id
      AND d.stato IN ('inviato','followup_inviato','followup2_inviato','followup3_inviato')
    RETURNING 1)
  SELECT COALESCE(count(*), 0)::integer FROM agg;
$f$;
CREATE OR REPLACE FUNCTION public.openwa_campagna_segna_risposta(p_phone text)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$
  WITH agg AS (
    UPDATE public.openwa_campagna_destinatari d
    SET stato = 'risposto', risposto_at = now(), claimed_at = NULL
    FROM public.openwa_campagne c
    WHERE c.id = d.campagna_id AND c.stop_se_risponde
      AND d.stato IN ('inviato','followup_inviato','followup2_inviato','followup3_inviato')
      AND public.openwa_norm_tel(p_phone) IS NOT NULL
      AND d.contact_id IN (
        SELECT id FROM public.marketing_contacts
        WHERE company_id = '00000000-0000-0000-0000-000000000001' AND public.openwa_norm_tel(phone) = public.openwa_norm_tel(p_phone))
    RETURNING 1)
  SELECT COALESCE(count(*), 0)::integer FROM agg;
$f$;
