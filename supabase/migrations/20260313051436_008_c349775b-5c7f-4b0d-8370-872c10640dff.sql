-- ============================================================
-- 6. RPC for monthly timeline (server-side aggregation)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_documenti_monthly_timeline(
  p_company_id UUID,
  p_tipos TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT 
      EXTRACT(YEAR FROM data_emissione)::INTEGER AS year,
      EXTRACT(MONTH FROM data_emissione)::INTEGER AS month,
      COUNT(*)::INTEGER AS doc_count,
      COALESCE(SUM(totale_documento), 0)::NUMERIC AS total_amount
    FROM public.documenti_fiscali
    WHERE company_id = p_company_id
      AND stato != 'annullata'
      AND (p_tipos IS NULL OR tipo = ANY(p_tipos))
      AND data_emissione >= (date_trunc('month', NOW()) - INTERVAL '12 months')::DATE
      AND data_emissione < (date_trunc('month', NOW()) + INTERVAL '4 months')::DATE
    GROUP BY 1, 2
    ORDER BY 1, 2
  ) t;
  
  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;
