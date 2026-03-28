-- 4. Partial index on active bank accounts
CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON public.bank_accounts(company_id) WHERE is_active = true;
