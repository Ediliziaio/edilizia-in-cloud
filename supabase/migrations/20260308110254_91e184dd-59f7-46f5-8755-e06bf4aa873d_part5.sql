-- 2. company_auto_topup
CREATE TABLE IF NOT EXISTS public.company_auto_topup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  wallet_type text NOT NULL DEFAULT 'email',
  enabled boolean NOT NULL DEFAULT false,
  threshold_eur numeric NOT NULL DEFAULT 5.00,
  topup_amount_eur numeric NOT NULL DEFAULT 20.00,
  payment_method text DEFAULT 'stripe',
  stripe_payment_method_id text,
  last_topup_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, wallet_type)
);
