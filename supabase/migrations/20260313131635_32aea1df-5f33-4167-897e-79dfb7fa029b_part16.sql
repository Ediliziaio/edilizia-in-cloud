-- RPC: get_automation_counts
DROP FUNCTION IF EXISTS public.get_automation_counts(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.get_automation_counts(p_company_id UUID)
RETURNS TABLE(categoria TEXT, totale BIGINT, attive BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    ar.categoria,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE ar.attiva = true)::BIGINT
  FROM public.automation_rules ar
  WHERE ar.company_id = p_company_id AND ar.is_template = false
  GROUP BY ar.categoria
  ORDER BY ar.categoria;
$$;
