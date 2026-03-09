
-- V2 Schema Updates for Tesoreria

-- 1. Add expires_at to bank_connections
ALTER TABLE public.bank_connections ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- 2. Index on expires_at
CREATE INDEX IF NOT EXISTS idx_bank_connections_expires ON public.bank_connections(expires_at);

-- 3. Add is_case_sensitive to bank_categorization_rules
ALTER TABLE public.bank_categorization_rules ADD COLUMN IF NOT EXISTS is_case_sensitive boolean NOT NULL DEFAULT false;

-- 4. Partial index on active bank accounts
CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON public.bank_accounts(company_id) WHERE is_active = true;

-- 5. Fix get_treasury_summary RPC to use subqueries (no GROUP BY issues with 0 accounts)
CREATE OR REPLACE FUNCTION public.get_treasury_summary(p_company_id uuid)
RETURNS TABLE (
  total_balance        numeric,
  total_credit_balance numeric,
  total_debit_balance  numeric,
  accounts_count       bigint,
  connections_count    bigint,
  monthly_income       numeric,
  monthly_expenses     numeric,
  monthly_net          numeric,
  last_sync_at         timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT COALESCE(SUM(ba.current_balance), 0) FROM public.bank_accounts ba WHERE ba.company_id = p_company_id AND ba.is_active = true) AS total_balance,
    (SELECT COALESCE(SUM(ba.current_balance), 0) FROM public.bank_accounts ba WHERE ba.company_id = p_company_id AND ba.is_active = true AND ba.current_balance > 0) AS total_credit_balance,
    (SELECT COALESCE(SUM(ba.current_balance), 0) FROM public.bank_accounts ba WHERE ba.company_id = p_company_id AND ba.is_active = true AND ba.current_balance < 0) AS total_debit_balance,
    (SELECT COUNT(*) FROM public.bank_accounts ba WHERE ba.company_id = p_company_id AND ba.is_active = true) AS accounts_count,
    (SELECT COUNT(*) FROM public.bank_connections bc WHERE bc.company_id = p_company_id AND bc.status = 'active') AS connections_count,
    (SELECT COALESCE(SUM(t.amount), 0) FROM public.bank_transactions t WHERE t.company_id = p_company_id AND t.transaction_type = 'credit' AND t.booking_date >= date_trunc('month', CURRENT_DATE)) AS monthly_income,
    (SELECT COALESCE(SUM(ABS(t.amount)), 0) FROM public.bank_transactions t WHERE t.company_id = p_company_id AND t.transaction_type = 'debit' AND t.booking_date >= date_trunc('month', CURRENT_DATE)) AS monthly_expenses,
    (SELECT COALESCE(SUM(t.amount), 0) FROM public.bank_transactions t WHERE t.company_id = p_company_id AND t.booking_date >= date_trunc('month', CURRENT_DATE)) AS monthly_net,
    (SELECT MAX(bc.last_sync_at) FROM public.bank_connections bc WHERE bc.company_id = p_company_id AND bc.status = 'active') AS last_sync_at;
$$;
