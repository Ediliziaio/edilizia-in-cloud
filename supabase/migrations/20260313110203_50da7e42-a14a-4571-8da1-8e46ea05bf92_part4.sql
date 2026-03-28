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
