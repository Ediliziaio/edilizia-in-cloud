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
