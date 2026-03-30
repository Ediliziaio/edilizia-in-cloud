-- 2. admin_credit_adjustments
CREATE TABLE IF NOT EXISTS public.admin_credit_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service text NOT NULL CHECK (service IN ('email', 'ai_agents', 'whatsapp')),
  amount_eur numeric(12,4) NOT NULL,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
