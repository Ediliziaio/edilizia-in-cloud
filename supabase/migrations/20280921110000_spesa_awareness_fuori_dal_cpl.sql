-- La spesa di awareness e interazione non entra più nel costo per lead (21/09/2026).
--
-- La console clienti marketing leggeva la spesa dell'intero account Meta e la
-- divideva per i lead: una campagna di visualizzazioni video o di traffico,
-- che per costruzione non porta richieste, alzava il CPL, faceva scattare gli
-- allarmi su «spesa senza lead» e colorava di giallo un cliente le cui campagne
-- lead andavano bene. BeMade negli ultimi 30 giorni aveva due campagne così:
-- «20 SETTEMBRE PREZZI INT» (216 €, zero lead) e «TOFU | Video | IG |» (80 €).
--
-- Da qui:
--   1. mkt_spesa_inserzione tiene l'obiettivo Meta di ogni campagna (lo scrive
--      meta-ads-sync-insights, che l'obiettivo lo legge già nella chiamata
--      sulle campagne);
--   2. mkt_campagne_classificate dice, per un periodo, quali campagne sono
--      awareness/interazione e quali lead generation — UNA regola sola, usata
--      dal motore e dal rapporto del mattino;
--   3. mkt_calcola_metriche calcola CPL, costo per sopralluogo e «spesa senza
--      lead» sulla sola spesa lead generation, e salva a parte la spesa
--      awareness e i sopralluoghi a 30 giorni (servono al tasso di chiusura:
--      stessa regola dei sopralluoghi a 14 giorni — passaggi di fase e
--      appuntamenti —, non il solo calendario, che per BeMade dava 0 contro 52).
--
-- La regola: una campagna è awareness se il suo obiettivo Meta è di notorietà,
-- interazione o traffico E negli ultimi 31 giorni non ha dichiarato nemmeno un
-- lead. Una campagna di traffico che porta richieste resta lead generation.
-- Obiettivo sconosciuto = lead generation: finché il sync non l'ha letto, il
-- conto resta quello di prima. Limite noto: una campagna di messaggi
-- (OUTCOME_ENGAGEMENT verso WhatsApp) che porta conversazioni ma nessun «lead»
-- dichiarato viene contata come awareness.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ── 1. L'obiettivo della campagna ───────────────────────────────────────────
ALTER TABLE public.mkt_spesa_inserzione
  ADD COLUMN IF NOT EXISTS obiettivo text;

COMMENT ON COLUMN public.mkt_spesa_inserzione.obiettivo IS
  'Obiettivo Meta della campagna (OUTCOME_LEADS, OUTCOME_AWARENESS, VIDEO_VIEWS…), scritto da meta-ads-sync-insights. Sulle righe per inserzione è quello della campagna madre.';

ALTER TABLE public.mkt_metriche_giorno
  ADD COLUMN IF NOT EXISTS spesa_aw_giorno numeric(12,2),
  ADD COLUMN IF NOT EXISTS spesa_aw_7g numeric(12,2),
  ADD COLUMN IF NOT EXISTS spesa_aw_mese numeric(12,2),
  ADD COLUMN IF NOT EXISTS sopralluoghi_30g integer;

COMMENT ON COLUMN public.mkt_metriche_giorno.spesa_aw_7g IS
  'Parte della spesa (spesa_7g) andata a campagne di awareness, interazione o traffico senza lead: NON entra nel CPL. Regola in mkt_campagne_classificate.';

-- ── 2. Una regola sola per dire cos'è awareness ─────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_obiettivo_awareness(p_obiettivo text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Obiettivi Meta attuali (OUTCOME_*) e quelli vecchi ancora sulle campagne
  -- storiche. Lead, vendite, conversioni e messaggi restano lead generation.
  SELECT upper(coalesce(p_obiettivo, '')) IN (
    'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_TRAFFIC',
    'BRAND_AWARENESS', 'REACH', 'LOCAL_AWARENESS', 'VIDEO_VIEWS',
    'POST_ENGAGEMENT', 'PAGE_LIKES', 'EVENT_RESPONSES', 'LINK_CLICKS'
  );
$function$;

CREATE OR REPLACE FUNCTION public.mkt_campagne_classificate(p_company uuid, p_da date, p_a date)
 RETURNS TABLE(campagna text, nome text, obiettivo_meta text, spesa_periodo numeric, lead_periodo integer, awareness boolean)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Campagne di un'azienda nel periodo [p_da, p_a). Il controllo «ha mai
  -- portato lead» guarda sempre gli ultimi 31 giorni fino a p_a, anche se il
  -- periodo chiesto è più corto: una campagna lead in un giorno senza richieste
  -- resta una campagna lead.
  WITH righe AS (
    SELECT i.campagna_id,
           max(i.campagna_nome) AS campagna_nome,
           max(i.obiettivo) AS obiettivo,
           coalesce(sum(i.spesa) FILTER (WHERE i.giorno >= p_da), 0) AS spesa,
           coalesce(sum(i.lead_dichiarati) FILTER (WHERE i.giorno >= p_da), 0)::integer AS lead,
           coalesce(bool_or(coalesce(i.lead_dichiarati, 0) > 0), false) AS ha_portato_lead
      FROM public.mkt_spesa_inserzione i
     WHERE i.company_id = p_company
       AND i.livello = 'campagna'
       AND i.giorno >= least(p_da, p_a - 31)
       AND i.giorno < p_a
     GROUP BY i.campagna_id
  )
  SELECT r.campagna_id, r.campagna_nome, r.obiettivo, r.spesa, r.lead,
         public.mkt_obiettivo_awareness(r.obiettivo) AND NOT r.ha_portato_lead
    FROM righe r;
$function$;

CREATE OR REPLACE FUNCTION public.mkt_spesa_awareness(p_company uuid, p_da date, p_a date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(sum(c.spesa_periodo) FILTER (WHERE c.awareness), 0)
    FROM public.mkt_campagne_classificate(p_company, p_da, p_a) c;
$function$;

REVOKE ALL ON FUNCTION public.mkt_campagne_classificate(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_spesa_awareness(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_obiettivo_awareness(text) FROM PUBLIC, anon;

-- ── 3. Il motore: CPL sulla spesa lead generation ───────────────────────────
-- La funzione si modifica sul posto, come fa 20280920110000: sulla definizione
-- in produzione si applicano sostituzioni puntuali, ognuna verificata, invece
-- di ricopiarne a mano ventitremila caratteri. Se un pezzo atteso non c'è, la
-- migrazione si ferma senza toccare niente.
DO $mig$
DECLARE
  v_def text;
  v_nuova text;
  -- coppie (cosa c'è, cosa diventa)
  v_da text[] := ARRAY[
    -- a) la spesa awareness entra fra le colonne di base
    'sp.*, ld.*',
    -- b) CPL grezzo
    'CASE WHEN b.lead_grezzi_7g > 0 AND b.spesa_7g > 0 THEN round(b.spesa_7g / b.lead_grezzi_7g, 2) END AS cpl_grezzo_7g',
    -- c) CPL valido
    'CASE WHEN b.lead_validi_7g > 0 AND b.spesa_7g > 0 THEN round(b.spesa_7g / b.lead_validi_7g, 2) END AS cpl_valido_7g',
    -- d) costo per sopralluogo
    'CASE WHEN b.appuntamenti_14g > 0 AND b.spesa_14g > 0 THEN round(b.spesa_14g / b.appuntamenti_14g, 2) END AS costo_appuntamento_14g',
    -- e) spesa senza lead: apertura
    E'(SELECT coalesce(sum(s.spesa), 0) FROM (\n              SELECT m.giorno, m.spesa FROM public.mkt_spesa_giornaliera m WHERE m.company_id = b.company_id AND m.giorno >= b.g - 30',
    -- f) spesa senza lead: chiusura
    E') s WHERE s.giorno > coalesce((b.ultimo_lead AT TIME ZONE \'Europe/Rome\')::date, b.g - 31)) AS spesa_senza_lead',
    -- g) colonne salvate
    'spesa_giorno, spesa_7g, spesa_14g, spesa_mese, budget_giornaliero,',
    -- h) valori salvati
    'c.spesa_ieri, c.spesa_7g, c.spesa_14g, c.spesa_mese, c.budget_giornaliero,',
    -- i) aggiornamento
    'spesa_giorno = EXCLUDED.spesa_giorno, '
  ];
  v_a text[] := ARRAY[
    'sp.*, aw.*, ld.*',
    'CASE WHEN b.lead_grezzi_7g > 0 AND b.spesa_7g - b.spesa_aw_7g > 0 THEN round((b.spesa_7g - b.spesa_aw_7g) / b.lead_grezzi_7g, 2) END AS cpl_grezzo_7g',
    'CASE WHEN b.lead_validi_7g > 0 AND b.spesa_7g - b.spesa_aw_7g > 0 THEN round((b.spesa_7g - b.spesa_aw_7g) / b.lead_validi_7g, 2) END AS cpl_valido_7g',
    'CASE WHEN b.appuntamenti_14g > 0 AND b.spesa_14g - b.spesa_aw_14g > 0 THEN round((b.spesa_14g - b.spesa_aw_14g) / b.appuntamenti_14g, 2) END AS costo_appuntamento_14g',
    E'greatest(0, (SELECT coalesce(sum(s.spesa), 0) FROM (\n              SELECT m.giorno, m.spesa FROM public.mkt_spesa_giornaliera m WHERE m.company_id = b.company_id AND m.giorno >= b.g - 30',
    E') s WHERE s.giorno > coalesce((b.ultimo_lead AT TIME ZONE \'Europe/Rome\')::date, b.g - 31))\n              - public.mkt_spesa_awareness(b.company_id, coalesce((b.ultimo_lead AT TIME ZONE \'Europe/Rome\')::date, b.g - 31) + 1, b.g + 1)) AS spesa_senza_lead',
    'spesa_giorno, spesa_7g, spesa_14g, spesa_mese, budget_giornaliero, spesa_aw_giorno, spesa_aw_7g, spesa_aw_mese, sopralluoghi_30g,',
    'c.spesa_ieri, c.spesa_7g, c.spesa_14g, c.spesa_mese, c.budget_giornaliero, c.spesa_aw_ieri, c.spesa_aw_7g, c.spesa_aw_mese, c.appuntamenti_30g,',
    'spesa_aw_giorno = EXCLUDED.spesa_aw_giorno, spesa_aw_7g = EXCLUDED.spesa_aw_7g, spesa_aw_mese = EXCLUDED.spesa_aw_mese, sopralluoghi_30g = EXCLUDED.sopralluoghi_30g, spesa_giorno = EXCLUDED.spesa_giorno, '
  ];
  v_lateral_da constant text := E'      ) sp\n';
  v_lateral_a constant text := E'      ) sp\n'
    || E'      -- Spesa andata a campagne di awareness, interazione o traffico senza lead:\n'
    || E'      -- esce dal CPL (regola in mkt_campagne_classificate).\n'
    || E'      CROSS JOIN LATERAL (\n'
    || E'        SELECT public.mkt_spesa_awareness(cli.company_id, par.g - 1, par.g) AS spesa_aw_ieri,\n'
    || E'               public.mkt_spesa_awareness(cli.company_id, par.g - 7, par.g) AS spesa_aw_7g,\n'
    || E'               public.mkt_spesa_awareness(cli.company_id, par.g - 14, par.g) AS spesa_aw_14g,\n'
    || E'               public.mkt_spesa_awareness(cli.company_id, par.m0, par.g) AS spesa_aw_mese\n'
    || E'      ) aw\n';
  i int;
  v_inizio int;
  v_fine int;
  v_blocco text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mkt_calcola_metriche';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'mkt_calcola_metriche non trovata';
  END IF;
  -- Già fatto: la migrazione si può rilanciare.
  IF position('spesa_aw_7g' in v_def) > 0 THEN
    RETURN;
  END IF;

  v_nuova := v_def;
  FOR i IN 1 .. array_length(v_da, 1) LOOP
    IF (length(v_nuova) - length(replace(v_nuova, v_da[i], ''))) / length(v_da[i]) <> 1 THEN
      RAISE EXCEPTION 'mkt_calcola_metriche: il pezzo % non c''è una volta sola: %', i, left(v_da[i], 80);
    END IF;
    v_nuova := replace(v_nuova, v_da[i], v_a[i]);
  END LOOP;

  -- Sopralluoghi a 30 giorni: lo stesso blocco dei 14 giorni, copiato con la
  -- finestra allargata, così le due misure non possono divergere.
  v_inizio := position('(SELECT count(DISTINCT y.opportunity_id) FROM (' in v_nuova);
  v_fine := position(') y) AS appuntamenti_14g' in v_nuova);
  IF v_inizio = 0 OR v_fine = 0 OR v_fine < v_inizio THEN
    RAISE EXCEPTION 'mkt_calcola_metriche: blocco dei sopralluoghi a 14 giorni non trovato';
  END IF;
  v_blocco := substr(v_nuova, v_inizio, v_fine - v_inizio + length(') y) AS appuntamenti_14g'));
  IF (length(v_blocco) - length(replace(v_blocco, 'par.t14', ''))) / length('par.t14') <> 2 THEN
    RAISE EXCEPTION 'mkt_calcola_metriche: il blocco dei sopralluoghi non ha le due finestre attese';
  END IF;
  v_nuova := replace(v_nuova, v_blocco,
    v_blocco || E',\n               ' || replace(replace(v_blocco, 'par.t14', 'par.t30'), 'AS appuntamenti_14g', 'AS appuntamenti_30g'));

  IF (length(v_nuova) - length(replace(v_nuova, v_lateral_da, ''))) / length(v_lateral_da) <> 1 THEN
    RAISE EXCEPTION 'mkt_calcola_metriche: la chiusura della spesa (") sp") non c''è una volta sola';
  END IF;
  v_nuova := replace(v_nuova, v_lateral_da, v_lateral_a);

  EXECUTE v_nuova;
END
$mig$;
