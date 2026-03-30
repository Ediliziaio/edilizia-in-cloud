DROP POLICY IF EXISTS "Staff can view list members if permitted" ON public.marketing_contact_list_members;
CREATE POLICY "Staff can view list members if permitted"
  ON public.marketing_contact_list_members FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND EXISTS (
    SELECT 1 FROM public.marketing_contact_lists l
    WHERE l.id = marketing_contact_list_members.list_id
    AND l.company_id = get_user_company_id(auth.uid())
  ));
