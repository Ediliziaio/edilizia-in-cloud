DROP FUNCTION IF EXISTS public.get_cash_flow_by_month(uuid, int) CASCADE;
CREATE OR REPLACE FUNCTION public.get_cash_flow_by_month(p_company_id uuid, p_months int DEFAULT 6)
RETURNS TABLE (month text, income numeric, expenses numeric, net numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(date_trunc('month', t.booking_date), 'YYYY-MM'),
    COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'credit'), 0),
    COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.transaction_type = 'debit'), 0),
    COALESCE(SUM(t.amount), 0)
  FROM public.bank_transactions t
  WHERE t.company_id = p_company_id
    AND t.booking_date >= date_trunc('month', CURRENT_DATE) - make_interval(months => p_months - 1)
    AND t.status = 'booked'
  GROUP BY date_trunc('month', t.booking_date)
  ORDER BY 1 ASC;
$$;
