
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

-- Indexes
CREATE INDEX idx_sales_targets_company ON public.sales_targets(company_id);
CREATE INDEX idx_sales_targets_user ON public.sales_targets(user_id);

-- Enable RLS
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

-- SELECT: all company members can read
CREATE POLICY "Company members can view sales targets"
ON public.sales_targets FOR SELECT
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
);

-- INSERT: only admins
CREATE POLICY "Admins can insert sales targets"
ON public.sales_targets FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
  AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin'))
);

-- UPDATE: only admins
CREATE POLICY "Admins can update sales targets"
ON public.sales_targets FOR UPDATE
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin'))
);

-- DELETE: only admins
CREATE POLICY "Admins can delete sales targets"
ON public.sales_targets FOR DELETE
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin'))
);

-- Updated_at trigger
CREATE TRIGGER update_sales_targets_updated_at
BEFORE UPDATE ON public.sales_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
