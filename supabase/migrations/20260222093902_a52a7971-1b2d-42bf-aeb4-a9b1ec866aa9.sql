
-- Create table for opportunity notes
CREATE TABLE public.marketing_opportunity_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES public.marketing_opportunities(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  content TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketing_opportunity_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Company admins can manage opportunity notes"
ON public.marketing_opportunity_notes FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view opportunity notes if permitted"
ON public.marketing_opportunity_notes FOR SELECT
USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all opportunity notes"
ON public.marketing_opportunity_notes FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
