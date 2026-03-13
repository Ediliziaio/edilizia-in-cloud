
-- ============================================================
-- VIEW: callcenter_lead_journey
-- Per ogni lead: prima chiamata, ultimo stato, nr tentativi
-- ============================================================
CREATE OR REPLACE VIEW public.callcenter_lead_journey AS
SELECT
  mc.id AS contact_id,
  mc.company_id,
  mc.assigned_to AS operatore_assegnato,
  mc.created_at AS lead_created_at,
  mc.source AS fonte_lead,

  -- Prima chiamata effettuata su questo contatto
  MIN(cl.started_at) AS prima_chiamata_at,

  -- Speed to Lead in minuti
  EXTRACT(EPOCH FROM (
    MIN(cl.started_at::timestamptz) - mc.created_at::timestamptz
  )) / 60.0 AS speed_to_lead_minuti,

  -- Numero totale di tentativi di chiamata
  COUNT(cl.id) AS nr_tentativi,

  -- Numero di chiamate andate a buon fine (risposto)
  COUNT(cl.id) FILTER (
    WHERE cl.outcome = 'answered'
  ) AS nr_contatti_riusciti,

  -- Flag: il lead è stato contattato almeno una volta?
  BOOL_OR(cl.outcome = 'answered') AS fu_contattato,

  -- Flag: ha almeno una chiamata (lavorato)?
  COUNT(cl.id) > 0 AS fu_lavorato,

  -- Durata media delle chiamate riuscite (in minuti)
  AVG(cl.duration_sec / 60.0) FILTER (
    WHERE cl.outcome = 'answered'
  ) AS durata_media_chiamata,

  -- Appuntamenti fissati su questo contatto
  COUNT(DISTINCT apt.id) AS appuntamenti_fissati,

  -- Show-up (confermato)
  COUNT(DISTINCT apt.id) FILTER (
    WHERE apt.status = 'confermato'
  ) AS appuntamenti_show_up

FROM public.marketing_contacts mc
LEFT JOIN public.call_logs cl ON cl.contact_id = mc.id
LEFT JOIN public.appointments apt ON apt.contact_id = mc.id
GROUP BY mc.id, mc.company_id, mc.assigned_to, mc.created_at, mc.source;

-- ============================================================
-- FUNZIONE: get_callcenter_kpi_per_operatore
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_callcenter_kpi_per_operatore(
  p_company_id UUID,
  p_data_inizio DATE,
  p_data_fine DATE,
  p_operatore_id UUID DEFAULT NULL
)
RETURNS TABLE(
  operatore_id     UUID,
  nome_operatore   TEXT,
  email_operatore  TEXT,
  lead_assegnati        BIGINT,
  lead_lavorati         BIGINT,
  pct_lead_lavorati     NUMERIC,
  lead_contattati       BIGINT,
  tasso_contatto        NUMERIC,
  tentativi_totali      BIGINT,
  tentativi_per_contatto NUMERIC,
  avg_speed_to_lead_min NUMERIC,
  median_speed_to_lead_min NUMERIC,
  pct_entro_5min        NUMERIC,
  pct_entro_1ora        NUMERIC,
  pct_oltre_24ore       NUMERIC,
  appuntamenti_fissati      BIGINT,
  tasso_app_su_contattati   NUMERIC,
  tasso_app_su_assegnati    NUMERIC,
  show_up_count         BIGINT,
  tasso_show_up         NUMERIC,
  durata_media_min      NUMERIC,
  chiamate_per_giorno   NUMERIC,
  giorni_lavorati       BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_giorni_lavorativi INTEGER := GREATEST((p_data_fine - p_data_inizio)::INTEGER * 5 / 7, 1);
BEGIN
  RETURN QUERY
  WITH
  leads_periodo AS (
    SELECT
      lj.operatore_assegnato AS op_id,
      COUNT(*) AS assegnati,
      COUNT(*) FILTER (WHERE lj.fu_lavorato) AS lavorati,
      COUNT(*) FILTER (WHERE lj.fu_contattato) AS contattati,
      SUM(lj.nr_tentativi) AS tot_tentativi,
      ROUND(AVG(lj.speed_to_lead_minuti) FILTER (WHERE lj.speed_to_lead_minuti >= 0), 1) AS avg_stl,
      ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lj.speed_to_lead_minuti)::NUMERIC, 1
      ) AS median_stl,
      ROUND(100.0 * COUNT(*) FILTER (WHERE lj.speed_to_lead_minuti BETWEEN 0 AND 5)
        / NULLIF(COUNT(*) FILTER (WHERE lj.speed_to_lead_minuti IS NOT NULL), 0), 1) AS pct_5min,
      ROUND(100.0 * COUNT(*) FILTER (WHERE lj.speed_to_lead_minuti BETWEEN 0 AND 60)
        / NULLIF(COUNT(*) FILTER (WHERE lj.speed_to_lead_minuti IS NOT NULL), 0), 1) AS pct_1ora,
      ROUND(100.0 * COUNT(*) FILTER (WHERE lj.speed_to_lead_minuti > 1440)
        / NULLIF(COUNT(*) FILTER (WHERE lj.speed_to_lead_minuti IS NOT NULL), 0), 1) AS pct_24ore,
      SUM(lj.appuntamenti_fissati) AS apt_fissati,
      SUM(lj.appuntamenti_show_up) AS apt_show_up,
      ROUND(AVG(lj.durata_media_chiamata) FILTER (WHERE lj.durata_media_chiamata > 0), 1) AS avg_durata
    FROM callcenter_lead_journey lj
    WHERE lj.company_id = p_company_id
      AND lj.lead_created_at::DATE BETWEEN p_data_inizio AND p_data_fine
      AND (p_operatore_id IS NULL OR lj.operatore_assegnato = p_operatore_id)
    GROUP BY lj.operatore_assegnato
  ),
  chiamate_periodo AS (
    SELECT
      cl.user_id AS op_id,
      COUNT(*) AS nr_chiamate,
      COUNT(DISTINCT cl.started_at::DATE) AS giorni_attivi
    FROM call_logs cl
    WHERE cl.company_id = p_company_id
      AND cl.started_at::DATE BETWEEN p_data_inizio AND p_data_fine
      AND (p_operatore_id IS NULL OR cl.user_id = p_operatore_id)
    GROUP BY cl.user_id
  )
  SELECT
    lp.op_id,
    (p.first_name || ' ' || p.last_name)::TEXT,
    p.email::TEXT,
    lp.assegnati,
    lp.lavorati,
    ROUND(100.0 * lp.lavorati / NULLIF(lp.assegnati, 0), 1),
    lp.contattati,
    ROUND(100.0 * lp.contattati / NULLIF(lp.lavorati, 0), 1),
    COALESCE(cp.nr_chiamate, 0),
    ROUND(COALESCE(cp.nr_chiamate, 0)::NUMERIC / NULLIF(lp.contattati, 0), 2),
    lp.avg_stl,
    lp.median_stl,
    lp.pct_5min,
    lp.pct_1ora,
    lp.pct_24ore,
    lp.apt_fissati,
    ROUND(100.0 * lp.apt_fissati / NULLIF(lp.contattati, 0), 1),
    ROUND(100.0 * lp.apt_fissati / NULLIF(lp.assegnati, 0), 1),
    lp.apt_show_up,
    ROUND(100.0 * lp.apt_show_up / NULLIF(lp.apt_fissati, 0), 1),
    lp.avg_durata,
    ROUND(COALESCE(cp.nr_chiamate, 0)::NUMERIC / NULLIF(v_giorni_lavorativi, 0), 1),
    COALESCE(cp.giorni_attivi, 0)
  FROM leads_periodo lp
  LEFT JOIN profiles p ON p.id = lp.op_id
  LEFT JOIN chiamate_periodo cp ON cp.op_id = lp.op_id
  ORDER BY lp.apt_fissati DESC;
END;
$$;

-- ============================================================
-- FUNZIONE: get_callcenter_speed_to_lead_distribuzione
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_callcenter_speed_to_lead_distribuzione(
  p_company_id UUID,
  p_data_inizio DATE,
  p_data_fine DATE,
  p_operatore_id UUID DEFAULT NULL
)
RETURNS TABLE(
  bucket TEXT,
  bucket_ordine INTEGER,
  nr_lead BIGINT,
  pct NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH buckets AS (
    SELECT
      CASE
        WHEN lj.speed_to_lead_minuti IS NULL        THEN 'Non chiamato'
        WHEN lj.speed_to_lead_minuti <= 5            THEN '0-5 min'
        WHEN lj.speed_to_lead_minuti <= 30           THEN '5-30 min'
        WHEN lj.speed_to_lead_minuti <= 60           THEN '30-60 min'
        WHEN lj.speed_to_lead_minuti <= 240          THEN '1-4 ore'
        WHEN lj.speed_to_lead_minuti <= 1440         THEN '4-24 ore'
        ELSE 'Oltre 24 ore'
      END AS bkt,
      CASE
        WHEN lj.speed_to_lead_minuti IS NULL        THEN 7
        WHEN lj.speed_to_lead_minuti <= 5            THEN 1
        WHEN lj.speed_to_lead_minuti <= 30           THEN 2
        WHEN lj.speed_to_lead_minuti <= 60           THEN 3
        WHEN lj.speed_to_lead_minuti <= 240          THEN 4
        WHEN lj.speed_to_lead_minuti <= 1440         THEN 5
        ELSE 6
      END AS ord,
      COUNT(*) AS cnt
    FROM callcenter_lead_journey lj
    WHERE lj.company_id = p_company_id
      AND lj.lead_created_at::DATE BETWEEN p_data_inizio AND p_data_fine
      AND (p_operatore_id IS NULL OR lj.operatore_assegnato = p_operatore_id)
    GROUP BY 1, 2
  ),
  totale AS (SELECT SUM(cnt) AS t FROM buckets)
  SELECT b.bkt, b.ord, b.cnt, ROUND(100.0 * b.cnt / NULLIF(t.t, 0), 1)
  FROM buckets b, totale t
  ORDER BY b.ord;
END;
$$;

-- ============================================================
-- FUNZIONE: get_callcenter_trend_giornaliero
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_callcenter_trend_giornaliero(
  p_company_id UUID,
  p_data_inizio DATE,
  p_data_fine DATE,
  p_operatore_id UUID DEFAULT NULL
)
RETURNS TABLE(
  giorno DATE,
  giorno_label TEXT,
  giorno_settimana TEXT,
  nr_chiamate BIGINT,
  nr_contatti BIGINT,
  nr_appuntamenti BIGINT,
  tasso_contatto NUMERIC,
  tasso_appuntamento NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.d::DATE,
    TO_CHAR(d.d, 'DD/MM')::TEXT,
    TO_CHAR(d.d, 'Dy')::TEXT,
    COUNT(DISTINCT cl.id) AS nr_chiam,
    COUNT(DISTINCT cl.id) FILTER (WHERE cl.outcome = 'answered') AS nr_cont,
    COUNT(DISTINCT apt.id) AS nr_app,
    ROUND(100.0 * COUNT(DISTINCT cl.id) FILTER (WHERE cl.outcome = 'answered')
      / NULLIF(COUNT(DISTINCT cl.id), 0), 1),
    ROUND(100.0 * COUNT(DISTINCT apt.id)
      / NULLIF(COUNT(DISTINCT cl.id) FILTER (WHERE cl.outcome = 'answered'), 0), 1)
  FROM generate_series(p_data_inizio::timestamptz, p_data_fine::timestamptz, '1 day') d(d)
  LEFT JOIN call_logs cl ON
    cl.started_at::DATE = d.d::DATE
    AND cl.company_id = p_company_id
    AND (p_operatore_id IS NULL OR cl.user_id = p_operatore_id)
  LEFT JOIN appointments apt ON
    apt.created_at::DATE = d.d::DATE
    AND apt.company_id = p_company_id
    AND (p_operatore_id IS NULL OR apt.created_by = p_operatore_id)
  GROUP BY d.d
  ORDER BY d.d;
END;
$$;

-- ============================================================
-- FUNZIONE: get_callcenter_fonte_lead_performance
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_callcenter_fonte_lead_performance(
  p_company_id UUID,
  p_data_inizio DATE,
  p_data_fine DATE
)
RETURNS TABLE(
  fonte TEXT,
  lead_totali BIGINT,
  lead_contattati BIGINT,
  appuntamenti BIGINT,
  tasso_contatto NUMERIC,
  tasso_appuntamento NUMERIC,
  avg_speed_to_lead_min NUMERIC,
  qualita_fonte TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(lj.fonte_lead, 'Non specificata')::TEXT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE lj.fu_contattato)::BIGINT,
    SUM(lj.appuntamenti_fissati)::BIGINT,
    ROUND(100.0 * COUNT(*) FILTER (WHERE lj.fu_contattato) / NULLIF(COUNT(*), 0), 1),
    ROUND(100.0 * SUM(lj.appuntamenti_fissati) / NULLIF(COUNT(*), 0), 1),
    ROUND(AVG(lj.speed_to_lead_minuti) FILTER (WHERE lj.speed_to_lead_minuti >= 0), 1),
    CASE
      WHEN ROUND(100.0 * SUM(lj.appuntamenti_fissati) / NULLIF(COUNT(*), 0), 1) >= 20 THEN 'ottima'
      WHEN ROUND(100.0 * SUM(lj.appuntamenti_fissati) / NULLIF(COUNT(*), 0), 1) >= 10 THEN 'buona'
      ELSE 'scarsa'
    END::TEXT
  FROM callcenter_lead_journey lj
  WHERE lj.company_id = p_company_id
    AND lj.lead_created_at::DATE BETWEEN p_data_inizio AND p_data_fine
  GROUP BY COALESCE(lj.fonte_lead, 'Non specificata')
  HAVING COUNT(*) >= 3
  ORDER BY SUM(lj.appuntamenti_fissati) DESC;
END;
$$;
