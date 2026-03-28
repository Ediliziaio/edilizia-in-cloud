-- RPCs
CREATE OR REPLACE FUNCTION public.get_treasury_summary(p_company_id uuid)
RETURNS TABLE (total_balance numeric, total_credit_balance numeric, total_debit_balance numeric, accounts_count bigint, connections_count bigint, monthly_income numeric, monthly_expenses numeric, monthly_net numeric, last_sync_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(ba.current_balance), 0),
    COALESCE(SUM(ba.current_balance) FILTER (WHERE ba.current_balance > 0), 0),
    COALESCE(SUM(ba.current_balance) FILTER (WHERE ba.current_balance < 0), 0),
    COUNT(DISTINCT ba.id),
    COUNT(DISTINCT bc.id) FILTER (WHERE bc.status = 'active'),
    COALESCE((SELECT SUM(t.amount) FROM public.bank_transactions t WHERE t.company_id = p_company_id AND t.transaction_type = 'credit' AND t.booking_date >= date_trunc('month', CURRENT_DATE)), 0),
    COALESCE((SELECT SUM(ABS(t.amount)) FROM public.bank_transactions t WHERE t.company_id = p_company_id AND t.transaction_type = 'debit' AND t.booking_date >= date_trunc('month', CURRENT_DATE)), 0),
    COALESCE((SELECT SUM(t.amount) FROM public.bank_transactions t WHERE t.company_id = p_company_id AND t.booking_date >= date_trunc('month', CURRENT_DATE)), 0),
    MAX(bc.last_sync_at)
  FROM public.bank_accounts ba
  JOIN public.bank_connections bc ON bc.id = ba.connection_id
  WHERE ba.company_id = p_company_id AND ba.is_active = true;
$$;
