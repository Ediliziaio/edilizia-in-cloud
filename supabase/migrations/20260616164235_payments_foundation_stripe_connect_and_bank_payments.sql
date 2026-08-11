-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ============================================================================
-- Fondamenta PAGAMENTI (provider-agnostiche): Stripe Connect + PIS
-- ============================================================================
-- companies.stripe_connect_account_id: l'account Stripe "connesso" (Express)
--   dell'azienda → incassa carta/link, EiC trattiene application_fee (markup).
-- bank_payments: registro pagamenti/incassi qualunque sia il rail (stripe|pis).
-- ============================================================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.bank_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL,                       -- 'stripe' | 'enablebanking'
  direction text NOT NULL DEFAULT 'incoming',   -- 'incoming' (incasso) | 'outgoing' (pagamento)
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  scadenza_id uuid REFERENCES public.scadenze(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  application_fee numeric NOT NULL DEFAULT 0,    -- markup EiC
  description text,
  payer_name text,
  payer_email text,
  status text NOT NULL DEFAULT 'created',        -- created|pending|paid|failed|canceled
  provider_payment_id text,                      -- checkout session / payment intent / PIS payment id
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

-- Lettura: admin o permesso Tesoreria (come bank_*).
CREATE POLICY "payments_select" ON public.bank_payments FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = (SELECT auth.uid()))
    AND (
      has_role((SELECT auth.uid()), 'super_admin'::app_role)
      OR has_role((SELECT auth.uid()), 'company_admin'::app_role)
      OR has_permission((SELECT auth.uid()), 'can_view_tesoreria')
    )
  );
-- Scrittura solo via edge (service role); admin diretto consentito.
CREATE POLICY "payments_admin_all" ON public.bank_payments FOR ALL
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = (SELECT auth.uid()))
    AND (has_role((SELECT auth.uid()), 'super_admin'::app_role) OR has_role((SELECT auth.uid()), 'company_admin'::app_role))
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = (SELECT auth.uid()))
    AND (has_role((SELECT auth.uid()), 'super_admin'::app_role) OR has_role((SELECT auth.uid()), 'company_admin'::app_role))
  );
