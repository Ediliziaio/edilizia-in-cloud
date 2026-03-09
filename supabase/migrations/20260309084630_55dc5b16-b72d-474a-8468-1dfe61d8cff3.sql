
-- 1. Create dedicated banking_set_updated_at trigger function
CREATE OR REPLACE FUNCTION public.banking_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- 2. Reassign existing bank triggers to use the dedicated function
DROP TRIGGER IF EXISTS trg_bank_connections_updated_at ON public.bank_connections;
CREATE TRIGGER trg_bank_connections_updated_at BEFORE UPDATE ON public.bank_connections FOR EACH ROW EXECUTE FUNCTION public.banking_set_updated_at();

DROP TRIGGER IF EXISTS trg_bank_accounts_updated_at ON public.bank_accounts;
CREATE TRIGGER trg_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.banking_set_updated_at();

-- 3. Add trigger on bank_provider_configs (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_provider_configs') THEN
    DROP TRIGGER IF EXISTS trg_bank_provider_configs_updated_at ON public.bank_provider_configs;
    CREATE TRIGGER trg_bank_provider_configs_updated_at BEFORE UPDATE ON public.bank_provider_configs FOR EACH ROW EXECUTE FUNCTION public.banking_set_updated_at();
  END IF;
END $$;

-- 4. Add index on bank_sync_logs(status)
CREATE INDEX IF NOT EXISTS idx_bank_sync_logs_status ON public.bank_sync_logs(status);

-- 5. Fix get_treasury_summary: add AND t.status = 'booked' to monthly subqueries
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
    (SELECT COALESCE(SUM(t.amount), 0) FROM public.bank_transactions t WHERE t.company_id = p_company_id AND t.transaction_type = 'credit' AND t.status = 'booked' AND t.booking_date >= date_trunc('month', CURRENT_DATE)) AS monthly_income,
    (SELECT COALESCE(SUM(ABS(t.amount)), 0) FROM public.bank_transactions t WHERE t.company_id = p_company_id AND t.transaction_type = 'debit' AND t.status = 'booked' AND t.booking_date >= date_trunc('month', CURRENT_DATE)) AS monthly_expenses,
    (SELECT COALESCE(SUM(t.amount), 0) FROM public.bank_transactions t WHERE t.company_id = p_company_id AND t.status = 'booked' AND t.booking_date >= date_trunc('month', CURRENT_DATE)) AS monthly_net,
    (SELECT MAX(bc.last_sync_at) FROM public.bank_connections bc WHERE bc.company_id = p_company_id AND bc.status = 'active') AS last_sync_at;
$$;
