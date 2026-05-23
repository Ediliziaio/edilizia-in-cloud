-- Fix vendor monthly trend fan-out.
-- The previous function joined opportunities, appointments and contacts in one query:
-- counts used DISTINCT, but SUM(o.value) could be multiplied by appointment/contact rows.

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
  WITH months AS (
    SELECT generate_series(1, 12)::INTEGER AS mese
  ),
  opp_by_month AS (
    SELECT
      EXTRACT(MONTH FROM o.updated_at)::INTEGER AS mese,
      COUNT(*) FILTER (WHERE lower(coalesce(o.status, '')) IN ('won', 'closed_won', 'vinto'))::BIGINT AS opp_vinte,
      COUNT(*) FILTER (WHERE lower(coalesce(o.status, '')) IN ('lost', 'closed_lost', 'perso'))::BIGINT AS opp_perse,
      COALESCE(SUM(o.value) FILTER (WHERE lower(coalesce(o.status, '')) IN ('won', 'closed_won', 'vinto')), 0)::NUMERIC AS fatturato
    FROM public.marketing_opportunities o
    WHERE o.company_id = p_company_id
      AND o.assigned_to IS NOT NULL
      AND (p_agent_id IS NULL OR o.assigned_to = p_agent_id)
      AND EXTRACT(YEAR FROM o.updated_at) = v_anno
      AND lower(coalesce(o.status, '')) IN ('won', 'closed_won', 'vinto', 'lost', 'closed_lost', 'perso')
      AND o.deleted_at IS NULL
    GROUP BY 1
  ),
  appointments_by_month AS (
    SELECT
      EXTRACT(MONTH FROM a.appointment_date)::INTEGER AS mese,
      COUNT(*)::BIGINT AS appuntamenti_fissati,
      COUNT(*) FILTER (WHERE a.is_completed)::BIGINT AS appuntamenti_effettuati
    FROM public.appointments a
    WHERE a.company_id = p_company_id
      AND a.assigned_to IS NOT NULL
      AND (p_agent_id IS NULL OR a.assigned_to = p_agent_id)
      AND EXTRACT(YEAR FROM a.appointment_date) = v_anno
      AND a.is_blocked_slot = false
      AND lower(coalesce(a.status, '')) NOT IN ('cancelled', 'canceled', 'annullato')
    GROUP BY 1
  ),
  contacts_by_month AS (
    SELECT
      EXTRACT(MONTH FROM c.created_at)::INTEGER AS mese,
      COUNT(*)::BIGINT AS nuovi_contatti
    FROM public.marketing_contacts c
    WHERE c.company_id = p_company_id
      AND c.assigned_to IS NOT NULL
      AND (p_agent_id IS NULL OR c.assigned_to = p_agent_id)
      AND EXTRACT(YEAR FROM c.created_at) = v_anno
      AND c.deleted_at IS NULL
    GROUP BY 1
  )
  SELECT
    m.mese,
    TO_CHAR(MAKE_DATE(v_anno, m.mese, 1), 'Mon')::TEXT,
    COALESCE(o.opp_vinte, 0),
    COALESCE(o.opp_perse, 0),
    COALESCE(o.fatturato, 0),
    COALESCE(a.appuntamenti_fissati, 0),
    COALESCE(a.appuntamenti_effettuati, 0),
    ROUND(100.0 * COALESCE(o.opp_vinte, 0) / NULLIF(COALESCE(o.opp_vinte, 0) + COALESCE(o.opp_perse, 0), 0), 1),
    ROUND(100.0 * COALESCE(a.appuntamenti_effettuati, 0) / NULLIF(COALESCE(a.appuntamenti_fissati, 0), 0), 1),
    COALESCE(c.nuovi_contatti, 0)
  FROM months m
  LEFT JOIN opp_by_month o ON o.mese = m.mese
  LEFT JOIN appointments_by_month a ON a.mese = m.mese
  LEFT JOIN contacts_by_month c ON c.mese = m.mese
  ORDER BY m.mese;
END;
$$;
