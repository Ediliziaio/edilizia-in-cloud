
-- Step 1a: Tabella subscription_plans
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  price_monthly numeric NOT NULL DEFAULT 0,
  price_yearly numeric NOT NULL DEFAULT 0,
  max_orders integer NOT NULL DEFAULT -1,
  max_users integer NOT NULL DEFAULT -1,
  max_storage_mb integer NOT NULL DEFAULT 500,
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  stripe_product_id text,
  stripe_price_monthly_id text,
  stripe_price_yearly_id text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active plans"
  ON public.subscription_plans FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can manage all plans"
  ON public.subscription_plans FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Step 1b: Nuovi campi su companies
ALTER TABLE public.companies
  ADD COLUMN status text NOT NULL DEFAULT 'trial',
  ADD COLUMN trial_ends_at timestamptz DEFAULT (now() + interval '14 days'),
  ADD COLUMN subscription_plan_id uuid REFERENCES public.subscription_plans(id),
  ADD COLUMN stripe_customer_id text;

-- Step 1c: Tabella company_subscriptions
CREATE TABLE public.company_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  stripe_subscription_id text,
  billing_period text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'trialing',
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all subscriptions"
  ON public.company_subscriptions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Company admins can view their subscriptions"
  ON public.company_subscriptions FOR SELECT
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

-- Step 1d: Tabella subscription_logs
CREATE TABLE public.subscription_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  old_status text,
  new_status text,
  plan_id uuid REFERENCES public.subscription_plans(id),
  notes text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all logs"
  ON public.subscription_logs FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Company admins can view their logs"
  ON public.subscription_logs FOR SELECT
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

-- Inserire piani di default
INSERT INTO public.subscription_plans (name, slug, description, price_monthly, price_yearly, max_orders, max_users, max_storage_mb, features, position) VALUES
  ('Free', 'free', 'Piano gratuito con funzionalità base', 0, 0, 10, 3, 100, '["Ordini base", "1 utente staff", "100MB storage"]'::jsonb, 0),
  ('Pro', 'pro', 'Piano professionale per aziende in crescita', 49, 470, 100, 10, 2000, '["Ordini illimitati*", "10 utenti", "2GB storage", "Calendario", "Magazzino", "Report"]'::jsonb, 1),
  ('Enterprise', 'enterprise', 'Piano enterprise con funzionalità complete', 99, 950, -1, -1, 10000, '["Tutto illimitato", "Utenti illimitati", "10GB storage", "Supporto prioritario", "API access"]'::jsonb, 2);
