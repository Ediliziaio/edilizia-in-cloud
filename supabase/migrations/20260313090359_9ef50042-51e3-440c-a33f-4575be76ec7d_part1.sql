-- ============================================================
-- FUNCTION 2: get_vendor_trend_mensile
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_vendor_trend_mensile(
  p_company_id UUID,
  p_anno INTEGER DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL
)
RETURNS TABLE(
  mese INTEGER,
  mese_label TEXT,
  opp_vinte BIGINT,
  opp_perse BIGINT,
  fatturato NUMERIC,
  appuntamenti_fissati BIGINT,
  appuntamenti_effettuati BIGINT,
  tasso_chiusura NUMERIC,
  tasso_show_up NUMERIC,
  nuovi_contatti BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anno INTEGER := COALESCE(p_anno, EXTRACT(YEAR FROM NOW())::INTEGER);
BEGIN
  RETURN QUERY
  SELECT
    m.m::INTEGER,
    TO_CHAR(MAKE_DATE(v_anno, m.m, 1), 'Mon')::TEXT,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'won' AND EXTRACT(MONTH FROM o.updated_at) = m.m AND EXTRACT(YEAR FROM o.updated_at) = v_anno)::BIGINT,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'lost' AND EXTRACT(MONTH FROM o.updated_at) = m.m AND EXTRACT(YEAR FROM o.updated_at) = v_anno)::BIGINT,
    COALESCE(SUM(o.value) FILTER (WHERE o.status = 'won' AND EXTRACT(MONTH FROM o.updated_at) = m.m AND EXTRACT(YEAR FROM o.updated_at) = v_anno), 0)::NUMERIC,
    COUNT(DISTINCT a.id) FILTER (WHERE EXTRACT(MONTH FROM a.appointment_date) = m.m AND EXTRACT(YEAR FROM a.appointment_date) = v_anno)::BIGINT,
    COUNT(DISTINCT a.id) FILTER (WHERE a.is_completed AND EXTRACT(MONTH FROM a.appointment_date) = m.m AND EXTRACT(YEAR FROM a.appointment_date) = v_anno)::BIGINT,
    ROUND(100.0 * COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'won' AND EXTRACT(MONTH FROM o.updated_at) = m.m AND EXTRACT(YEAR FROM o.updated_at) = v_anno)
      / NULLIF(COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('won','lost') AND EXTRACT(MONTH FROM o.updated_at) = m.m AND EXTRACT(YEAR FROM o.updated_at) = v_anno), 0), 1),
    ROUND(100.0 * COUNT(DISTINCT a.id) FILTER (WHERE a.is_completed AND EXTRACT(MONTH FROM a.appointment_date) = m.m AND EXTRACT(YEAR FROM a.appointment_date) = v_anno)
      / NULLIF(COUNT(DISTINCT a.id) FILTER (WHERE EXTRACT(MONTH FROM a.appointment_date) = m.m AND EXTRACT(YEAR FROM a.appointment_date) = v_anno), 0), 1),
    COUNT(DISTINCT c.id) FILTER (WHERE EXTRACT(MONTH FROM c.created_at) = m.m AND EXTRACT(YEAR FROM c.created_at) = v_anno)::BIGINT
  FROM generate_series(1, 12) m(m)
  LEFT JOIN marketing_opportunities o ON
    o.company_id = p_company_id
    AND o.assigned_to IS NOT NULL
    AND (p_agent_id IS NULL OR o.assigned_to = p_agent_id)
  LEFT JOIN appointments a ON
    a.company_id = p_company_id
    AND a.assigned_to IS NOT NULL
    AND (p_agent_id IS NULL OR a.assigned_to = p_agent_id)
  LEFT JOIN marketing_contacts c ON
    c.company_id = p_company_id
    AND c.assigned_to IS NOT NULL
    AND (p_agent_id IS NULL OR c.assigned_to = p_agent_id)
  GROUP BY m.m
  ORDER BY m.m;
END;
$$;
