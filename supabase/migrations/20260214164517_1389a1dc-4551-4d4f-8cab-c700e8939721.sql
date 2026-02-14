
-- Tabella referrers
CREATE TABLE public.referrers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  referral_code text NOT NULL,
  commission_type text NOT NULL DEFAULT 'percentage',
  commission_value numeric NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  total_earned numeric NOT NULL DEFAULT 0,
  total_paid numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_referrers_referral_code ON public.referrers (referral_code);

ALTER TABLE public.referrers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all referrers"
ON public.referrers FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Tabella referral_companies
CREATE TABLE public.referral_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  referred_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  notes text
);

ALTER TABLE public.referral_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all referral_companies"
ON public.referral_companies FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Tabella referral_payouts
CREATE TABLE public.referral_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all referral_payouts"
ON public.referral_payouts FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Colonna referred_by in companies
ALTER TABLE public.companies ADD COLUMN referred_by uuid REFERENCES public.referrers(id);
