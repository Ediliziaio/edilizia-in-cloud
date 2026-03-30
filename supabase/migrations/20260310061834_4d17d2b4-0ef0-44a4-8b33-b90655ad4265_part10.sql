CREATE INDEX IF NOT EXISTS idx_leave_balances_company  ON public.leave_balances(company_id, year);
