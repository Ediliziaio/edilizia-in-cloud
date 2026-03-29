-- Create sales_targets table
CREATE TABLE public.sales_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  period_type text NOT NULL DEFAULT 'weekly',
  target_revenue numeric NOT NULL DEFAULT 0,
  target_contracts integer NOT NULL DEFAULT 0,
  target_appointments integer NOT NULL DEFAULT 0,
  target_calls integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, period_type)
);
