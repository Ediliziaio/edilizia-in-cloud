
-- Create treasury_categories table
CREATE TABLE public.treasury_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  area TEXT NOT NULL,
  parent_id UUID REFERENCES public.treasury_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  is_income BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.treasury_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Company admins can manage their treasury categories"
ON public.treasury_categories FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view treasury categories if permitted"
ON public.treasury_categories FOR SELECT
USING (has_permission(auth.uid(), 'can_view_forecast'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all treasury categories"
ON public.treasury_categories FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Add treasury_category_id to company_costs
ALTER TABLE public.company_costs ADD COLUMN treasury_category_id UUID REFERENCES public.treasury_categories(id) ON DELETE SET NULL;
