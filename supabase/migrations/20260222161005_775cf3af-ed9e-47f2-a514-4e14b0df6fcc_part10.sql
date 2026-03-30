-- RLS for marketing_contact_list_members
DROP POLICY IF EXISTS "Company admins can manage list members" ON public.marketing_contact_list_members;
CREATE POLICY "Company admins can manage list members"
  ON public.marketing_contact_list_members FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.marketing_contact_lists l
    WHERE l.id = marketing_contact_list_members.list_id
    AND l.company_id = get_user_company_id(auth.uid())
  ));
