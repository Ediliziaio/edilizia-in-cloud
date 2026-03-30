-- ============================================================
-- FUNCTION 1: get_vendor_kpi_per_agent
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_vendor_kpi_per_agent(
  p_company_id UUID,
  p_data_inizio DATE,
  p_data_fine DATE,
  p_agent_id UUID DEFAULT NULL
)
RETURNS TABLE(
  agent_id UUID,
  nome_agente TEXT,
  email_agente TEXT,
  opp_totali BIGINT,
  opp_vinte BIGINT,
  opp_perse BIGINT,
  opp_aperte BIGINT,
  tasso_chiusura NUMERIC,
  tasso_conversione NUMERIC,
  fatturato_generato NUMERIC,
  importo_medio_chiusura NUMERIC,
  pipeline_valore NUMERIC,
  fatturato_perso NUMERIC,
  appuntamenti_fissati BIGINT,
  appuntamenti_effettuati BIGINT,
  appuntamenti_no_show BIGINT,
  tasso_show_up NUMERIC,
  tasso_app_to_opp NUMERIC,
  tasso_app_to_close NUMERIC,
  avg_giorni_chiusura NUMERIC,
  avg_giorni_chiusura_perse NUMERIC,
  min_giorni_chiusura NUMERIC,
  max_giorni_chiusura NUMERIC,
  nuovi_contatti BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- Collect all agent IDs for this company
  all_agents AS (
    SELECT DISTINCT mo.assigned_to AS aid
    FROM marketing_opportunities mo
    WHERE mo.company_id = p_company_id
      AND mo.assigned_to IS NOT NULL
      AND (p_agent_id IS NULL OR mo.assigned_to = p_agent_id)
    UNION
    SELECT DISTINCT ap.assigned_to AS aid
    FROM appointments ap
    WHERE ap.company_id = p_company_id
      AND ap.assigned_to IS NOT NULL
      AND (p_agent_id IS NULL OR ap.assigned_to = p_agent_id)
  ),
  -- Opportunities aggregation
  opps AS (
    SELECT
      o.assigned_to AS aid,
      COUNT(*) AS totali,
      COUNT(*) FILTER (WHERE o.status = 'won' AND o.updated_at::DATE BETWEEN p_data_inizio AND p_data_fine) AS vinte,
      COUNT(*) FILTER (WHERE o.status = 'lost' AND o.updated_at::DATE BETWEEN p_data_inizio AND p_data_fine) AS perse,
      COUNT(*) FILTER (WHERE o.status NOT IN ('won','lost')) AS aperte,
      COALESCE(SUM(o.value) FILTER (WHERE o.status = 'won' AND o.updated_at::DATE BETWEEN p_data_inizio AND p_data_fine), 0) AS fat,
      COALESCE(AVG(o.value) FILTER (WHERE o.status = 'won' AND o.updated_at::DATE BETWEEN p_data_inizio AND p_data_fine), 0) AS avg_val,
      COALESCE(SUM(o.value) FILTER (WHERE o.status NOT IN ('won','lost')), 0) AS pipeline,
      COALESCE(SUM(o.value) FILTER (WHERE o.status = 'lost' AND o.updated_at::DATE BETWEEN p_data_inizio AND p_data_fine), 0) AS perso,
      ROUND(AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/86400.0) FILTER (WHERE o.status = 'won' AND o.updated_at::DATE BETWEEN p_data_inizio AND p_data_fine), 1) AS avg_gg_won,
      ROUND(AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/86400.0) FILTER (WHERE o.status = 'lost' AND o.updated_at::DATE BETWEEN p_data_inizio AND p_data_fine), 1) AS avg_gg_lost,
      ROUND(MIN(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/86400.0) FILTER (WHERE o.status = 'won' AND o.updated_at::DATE BETWEEN p_data_inizio AND p_data_fine), 1) AS min_gg,
      ROUND(MAX(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/86400.0) FILTER (WHERE o.status = 'won' AND o.updated_at::DATE BETWEEN p_data_inizio AND p_data_fine), 1) AS max_gg,
      COUNT(*) FILTER (WHERE o.status IN ('won','lost') AND o.updated_at::DATE BETWEEN p_data_inizio AND p_data_fine) AS chiuse_totali
    FROM marketing_opportunities o
    WHERE o.company_id = p_company_id
      AND o.assigned_to IS NOT NULL
      AND o.created_at::DATE <= p_data_fine
      AND (p_agent_id IS NULL OR o.assigned_to = p_agent_id)
    GROUP BY o.assigned_to
  ),
  -- Appointments aggregation
  apts AS (
    SELECT
      a.assigned_to AS aid,
      COUNT(*) AS fissati,
      COUNT(*) FILTER (WHERE a.is_completed = true) AS effettuati,
      COUNT(*) FILTER (WHERE a.is_completed = false AND a.appointment_date::DATE < CURRENT_DATE) AS no_shows
    FROM appointments a
    WHERE a.company_id = p_company_id
      AND a.assigned_to IS NOT NULL
      AND a.appointment_date::DATE BETWEEN p_data_inizio AND p_data_fine
      AND (p_agent_id IS NULL OR a.assigned_to = p_agent_id)
    GROUP BY a.assigned_to
  ),
  -- New contacts
  cts AS (
    SELECT
      c.assigned_to AS aid,
      COUNT(*) AS nuovi
    FROM marketing_contacts c
    WHERE c.company_id = p_company_id
      AND c.assigned_to IS NOT NULL
      AND c.created_at::DATE BETWEEN p_data_inizio AND p_data_fine
      AND (p_agent_id IS NULL OR c.assigned_to = p_agent_id)
    GROUP BY c.assigned_to
  )
  SELECT
    ag.aid,
    COALESCE(p.first_name || ' ' || p.last_name, p.email, ag.aid::TEXT)::TEXT,
    p.email::TEXT,
    COALESCE(o.totali, 0),
    COALESCE(o.vinte, 0),
    COALESCE(o.perse, 0),
    COALESCE(o.aperte, 0),
    ROUND(100.0 * COALESCE(o.vinte, 0) / NULLIF(COALESCE(o.chiuse_totali, 0), 0), 1),
    ROUND(100.0 * COALESCE(o.vinte, 0) / NULLIF(COALESCE(o.totali, 0), 0), 1),
    COALESCE(o.fat, 0),
    COALESCE(o.avg_val, 0),
    COALESCE(o.pipeline, 0),
    COALESCE(o.perso, 0),
    COALESCE(ap.fissati, 0),
    COALESCE(ap.effettuati, 0),
    COALESCE(ap.no_shows, 0),
    ROUND(100.0 * COALESCE(ap.effettuati, 0) / NULLIF(COALESCE(ap.fissati, 0), 0), 1),
    ROUND(100.0 * COALESCE(o.totali, 0) / NULLIF(COALESCE(ap.effettuati, 0), 0), 1),
    ROUND(100.0 * COALESCE(o.vinte, 0) / NULLIF(COALESCE(ap.effettuati, 0), 0), 1),
    COALESCE(o.avg_gg_won, 0),
    COALESCE(o.avg_gg_lost, 0),
    COALESCE(o.min_gg, 0),
    COALESCE(o.max_gg, 0),
    COALESCE(ct.nuovi, 0)
  FROM all_agents ag
  LEFT JOIN profiles p ON p.id = ag.aid
  LEFT JOIN opps o ON o.aid = ag.aid
  LEFT JOIN apts ap ON ap.aid = ag.aid
  LEFT JOIN cts ct ON ct.aid = ag.aid
  ORDER BY COALESCE(o.fat, 0) DESC;
END;
$$;
