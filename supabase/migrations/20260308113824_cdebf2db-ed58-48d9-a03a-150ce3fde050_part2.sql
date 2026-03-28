-- RPC: get_top_companies_by_email
CREATE OR REPLACE FUNCTION public.get_top_companies_by_email(
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  company_id uuid, company_name text, total_spent numeric,
  balance numeric, total_sent bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    ec.company_id, c.name,
    COALESCE(ec.total_spent_eur, 0),
    COALESCE(ec.balance_eur, 0),
    COALESCE(logs.cnt, 0)::bigint
  FROM public.email_credits ec
  JOIN public.companies c ON c.id = ec.company_id
  LEFT JOIN (
    SELECT company_id, COUNT(*)::bigint AS cnt FROM public.email_logs GROUP BY company_id
  ) logs ON logs.company_id = ec.company_id
  ORDER BY ec.total_spent_eur DESC NULLS LAST
  LIMIT p_limit;
$$;
