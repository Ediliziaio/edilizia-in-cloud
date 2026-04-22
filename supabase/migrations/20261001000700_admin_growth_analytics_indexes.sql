-- Indici per il widget Growth Analytics della dashboard Super Admin.
-- Rendono veloci i filtri per periodo su aziende, utenti, fatture Stripe e log subscription.

CREATE INDEX IF NOT EXISTS idx_companies_admin_created
  ON public.companies (is_platform_admin_company, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_created_company
  ON public.profiles (created_at DESC, company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_paid_at_status_company
  ON public.subscription_invoices (paid_at DESC, status, company_id)
  WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_logs_created_event_company
  ON public.subscription_logs (created_at DESC, event_type, company_id);
