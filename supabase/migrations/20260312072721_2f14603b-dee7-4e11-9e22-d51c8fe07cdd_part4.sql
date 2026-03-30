CREATE INDEX IF NOT EXISTS idx_subscription_invoices_company ON public.subscription_invoices(company_id, created_at DESC);
