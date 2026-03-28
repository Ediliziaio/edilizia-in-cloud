-- ============================================
-- 2. campaign_costs table
-- ============================================
CREATE TABLE public.campaign_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source text NOT NULL,
  campaign_name text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  spend_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
