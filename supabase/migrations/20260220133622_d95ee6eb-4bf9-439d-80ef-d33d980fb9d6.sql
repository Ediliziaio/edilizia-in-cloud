
CREATE TABLE public.order_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  error_type TEXT NOT NULL DEFAULT 'merce',
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  error_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their order errors"
ON public.order_errors
FOR ALL
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND company_id = get_user_company_id(auth.uid())
);

CREATE POLICY "Staff can view order errors if permitted"
ON public.order_errors
FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
);

CREATE POLICY "Super admins can manage all order errors"
ON public.order_errors
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
