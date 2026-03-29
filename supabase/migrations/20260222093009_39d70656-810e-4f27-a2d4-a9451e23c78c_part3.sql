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
