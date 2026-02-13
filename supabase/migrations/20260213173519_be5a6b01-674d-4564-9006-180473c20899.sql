
-- Create company_costs table
CREATE TABLE public.company_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cost_type TEXT NOT NULL DEFAULT 'fixed',
  amount NUMERIC NOT NULL DEFAULT 0,
  recurrence TEXT NOT NULL DEFAULT 'monthly',
  due_date DATE NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  category TEXT,
  notes TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_costs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Company admins can manage their costs"
ON public.company_costs
FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all costs"
ON public.company_costs
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Staff can view costs if permitted"
ON public.company_costs
FOR SELECT
USING (has_permission(auth.uid(), 'can_view_forecast'::text) AND company_id = get_user_company_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_company_costs_updated_at
BEFORE UPDATE ON public.company_costs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
