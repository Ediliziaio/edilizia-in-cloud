
-- Add object_type column to marketing_custom_fields
ALTER TABLE public.marketing_custom_fields 
ADD COLUMN object_type TEXT NOT NULL DEFAULT 'contact';

-- Create marketing_opportunity_field_values table
CREATE TABLE public.marketing_opportunity_field_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES public.marketing_opportunities(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.marketing_custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketing_opportunity_field_values ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Company admins can manage opportunity field values"
ON public.marketing_opportunity_field_values
FOR ALL
USING (
  has_role(auth.uid(), 'company_admin'::app_role) 
  AND EXISTS (
    SELECT 1 FROM marketing_opportunities mo 
    WHERE mo.id = marketing_opportunity_field_values.opportunity_id 
    AND mo.company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Staff can view opportunity field values if permitted"
ON public.marketing_opportunity_field_values
FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_orders'::text) 
  AND EXISTS (
    SELECT 1 FROM marketing_opportunities mo 
    WHERE mo.id = marketing_opportunity_field_values.opportunity_id 
    AND mo.company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Super admins can manage all opportunity field values"
ON public.marketing_opportunity_field_values
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
