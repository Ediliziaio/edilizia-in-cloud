-- ============================================================================
-- Fondamenta PAGAMENTI (Stripe Connect + PIS) — già applicata via MCP
-- ============================================================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.bank_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL,
  direction text NOT NULL DEFAULT 'incoming',
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  scadenza_id uuid REFERENCES public.scadenze(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  application_fee numeric NOT NULL DEFAULT 0,
  description text,
  payer_name text,
  payer_email text,
  status text NOT NULL DEFAULT 'created',
  provider_payment_id text,
  checkout_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bank_payments_company ON public.bank_payments(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_payments_provider_pid ON public.bank_payments(provider_payment_id) WHERE provider_payment_id IS NOT NULL;
ALTER TABLE public.bank_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select" ON public.bank_payments FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = (SELECT auth.uid()))
    AND (has_role((SELECT auth.uid()),'super_admin'::app_role) OR has_role((SELECT auth.uid()),'company_admin'::app_role) OR has_permission((SELECT auth.uid()),'can_view_tesoreria')));
CREATE POLICY "payments_admin_all" ON public.bank_payments FOR ALL
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = (SELECT auth.uid()))
    AND (has_role((SELECT auth.uid()),'super_admin'::app_role) OR has_role((SELECT auth.uid()),'company_admin'::app_role)))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = (SELECT auth.uid()))
    AND (has_role((SELECT auth.uid()),'super_admin'::app_role) OR has_role((SELECT auth.uid()),'company_admin'::app_role)));
