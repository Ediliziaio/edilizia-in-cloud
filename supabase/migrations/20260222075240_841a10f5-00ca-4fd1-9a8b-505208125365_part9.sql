CREATE POLICY "Staff can view contact field values if permitted"
  ON public.marketing_contact_field_values FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND EXISTS (
    SELECT 1 FROM public.marketing_contacts mc WHERE mc.id = marketing_contact_field_values.contact_id AND mc.company_id = get_user_company_id(auth.uid())
  ));
