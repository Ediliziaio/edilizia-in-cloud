-- ============================================================
-- 5. RPC for document counts (server-side aggregation)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_documenti_counts(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.get_documenti_counts(p_company_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'fatture', COUNT(*) FILTER (WHERE tipo IN ('fattura', 'fattura_pa') AND stato != 'annullata'),
    'proforma', COUNT(*) FILTER (WHERE tipo = 'proforma' AND stato != 'annullata'),
    'nota_credito', COUNT(*) FILTER (WHERE tipo = 'nota_credito' AND stato != 'annullata'),
    'ddt', COUNT(*) FILTER (WHERE tipo = 'ddt' AND stato != 'annullata'),
    'preventivo', COUNT(*) FILTER (WHERE tipo = 'preventivo' AND stato != 'annullata'),
    'annullate', COUNT(*) FILTER (WHERE stato = 'annullata')
  ) INTO v_result
  FROM public.documenti_fiscali
  WHERE company_id = p_company_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;
