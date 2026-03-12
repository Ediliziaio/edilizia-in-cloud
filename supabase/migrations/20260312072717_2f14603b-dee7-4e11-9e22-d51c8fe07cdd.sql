
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stripe_invoice_id   TEXT NOT NULL UNIQUE,
  stripe_customer_id  TEXT,
  amount_paid         INTEGER NOT NULL DEFAULT 0,
  amount_due          INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'eur',
  status              TEXT NOT NULL DEFAULT 'draft',
  invoice_url         TEXT,
  invoice_pdf         TEXT,
  period_start        TIMESTAMPTZ,
  period_end          TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_see_own_invoices"
  ON public.subscription_invoices
  FOR SELECT
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "service_role_manage_invoices"
  ON public.subscription_invoices
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_subscription_invoices_company ON public.subscription_invoices(company_id, created_at DESC);
CREATE INDEX idx_subscription_invoices_stripe ON public.subscription_invoices(stripe_invoice_id);

CREATE TRIGGER subscription_invoices_updated_at
  BEFORE UPDATE ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
