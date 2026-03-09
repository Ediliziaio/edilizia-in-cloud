
-- Create set_updated_at function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 1. bank_provider_configs
CREATE TABLE IF NOT EXISTS public.bank_provider_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_slug   text UNIQUE NOT NULL,
  provider_name   text NOT NULL,
  logo_url        text,
  description     text,
  is_enabled      boolean NOT NULL DEFAULT false,
  supported_countries text[] DEFAULT ARRAY['IT','FR','DE','ES','NL','BE','AT','PT'],
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bank_provider_configs
  (provider_slug, provider_name, logo_url, description, is_enabled, supported_countries)
VALUES (
  'gocardless', 'GoCardless Bank Account Data',
  'https://avatars.githubusercontent.com/u/1234567',
  'Open Banking PSD2 — 2.400+ banche EU (ex Nordigen)', false,
  ARRAY['IT','FR','DE','ES','NL','BE','AT','PT','GB','SE','NO','DK','FI','IE','PL','CZ','HU','SK','SI','HR','RO','BG','EE','LV','LT']
) ON CONFLICT (provider_slug) DO NOTHING;

-- 2. bank_connections
CREATE TABLE IF NOT EXISTS public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_slug text NOT NULL DEFAULT 'gocardless',
  institution_id text NOT NULL,
  institution_name text NOT NULL,
  institution_logo text,
  institution_country text DEFAULT 'IT',
  requisition_id text,
  requisition_link text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  last_sync_at timestamptz,
  accounts_count int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, requisition_id)
);
CREATE INDEX idx_bank_connections_company ON public.bank_connections(company_id);
CREATE INDEX idx_bank_connections_status ON public.bank_connections(status);

-- 3. bank_accounts
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  external_account_id text NOT NULL,
  iban text, bban text,
  account_name text, account_owner_name text,
  account_type text DEFAULT 'checking',
  currency text NOT NULL DEFAULT 'EUR',
  current_balance numeric(15,2), available_balance numeric(15,2),
  balance_updated_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, external_account_id)
);
CREATE INDEX idx_bank_accounts_company ON public.bank_accounts(company_id);
CREATE INDEX idx_bank_accounts_connection ON public.bank_accounts(connection_id);

-- 4. bank_transactions
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  external_transaction_id text NOT NULL,
  booking_date date, value_date date,
  amount numeric(15,2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  description text, creditor_name text, debtor_name text,
  creditor_iban text, debtor_iban text, merchant_name text, reference text,
  transaction_type text NOT NULL DEFAULT 'debit',
  status text NOT NULL DEFAULT 'booked',
  category text, category_icon text, note text,
  linked_invoice_id uuid, linked_cost_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, external_transaction_id)
);
CREATE INDEX idx_bank_transactions_company ON public.bank_transactions(company_id);
CREATE INDEX idx_bank_transactions_account ON public.bank_transactions(account_id);
CREATE INDEX idx_bank_transactions_date ON public.bank_transactions(booking_date DESC);
CREATE INDEX idx_bank_transactions_type ON public.bank_transactions(transaction_type);
CREATE INDEX idx_bank_transactions_category ON public.bank_transactions(category);

-- 5. bank_sync_logs
CREATE TABLE IF NOT EXISTS public.bank_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.bank_connections(id) ON DELETE SET NULL,
  sync_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'running',
  accounts_synced int NOT NULL DEFAULT 0,
  transactions_fetched int NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  triggered_by uuid REFERENCES auth.users(id)
);
CREATE INDEX idx_bank_sync_logs_company ON public.bank_sync_logs(company_id);

-- 6. bank_categorization_rules
CREATE TABLE IF NOT EXISTS public.bank_categorization_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 0,
  match_field text NOT NULL DEFAULT 'description',
  match_value text NOT NULL,
  match_type text NOT NULL DEFAULT 'contains',
  category text NOT NULL,
  category_icon text,
  auto_apply boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_rules_company ON public.bank_categorization_rules(company_id, priority);

-- tesoreria_enabled
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS tesoreria_enabled boolean DEFAULT false;

-- Triggers
CREATE TRIGGER trg_bank_connections_updated_at BEFORE UPDATE ON public.bank_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.bank_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_categorization_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read bank providers" ON public.bank_provider_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage bank providers" ON public.bank_provider_configs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Company users can view own bank connections" ON public.bank_connections FOR SELECT TO authenticated USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Company admins can manage bank connections" ON public.bank_connections FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()) AND (public.has_role(auth.uid(), 'company_admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()) AND (public.has_role(auth.uid(), 'company_admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "Super admins can manage all bank connections" ON public.bank_connections FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Company users can view own bank accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Company admins can manage bank accounts" ON public.bank_accounts FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()) AND public.has_role(auth.uid(), 'company_admin'::public.app_role)) WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()) AND public.has_role(auth.uid(), 'company_admin'::public.app_role));
CREATE POLICY "Super admins can manage all bank accounts" ON public.bank_accounts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Company users can view own bank transactions" ON public.bank_transactions FOR SELECT TO authenticated USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Company admins can manage bank transactions" ON public.bank_transactions FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()) AND public.has_role(auth.uid(), 'company_admin'::public.app_role)) WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()) AND public.has_role(auth.uid(), 'company_admin'::public.app_role));

CREATE POLICY "Company users can view own sync logs" ON public.bank_sync_logs FOR SELECT TO authenticated USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Company users manage own rules" ON public.bank_categorization_rules FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())) WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

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

CREATE OR REPLACE FUNCTION public.get_cash_flow_by_month(p_company_id uuid, p_months int DEFAULT 6)
RETURNS TABLE (month text, income numeric, expenses numeric, net numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(date_trunc('month', t.booking_date), 'YYYY-MM'),
    COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'credit'), 0),
    COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.transaction_type = 'debit'), 0),
    COALESCE(SUM(t.amount), 0)
  FROM public.bank_transactions t
  WHERE t.company_id = p_company_id
    AND t.booking_date >= date_trunc('month', CURRENT_DATE) - make_interval(months => p_months - 1)
    AND t.status = 'booked'
  GROUP BY date_trunc('month', t.booking_date)
  ORDER BY 1 ASC;
$$;
