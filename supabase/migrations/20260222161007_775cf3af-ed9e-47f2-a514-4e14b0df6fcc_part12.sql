DROP POLICY IF EXISTS "Super admins can manage all list members" ON public.marketing_contact_list_members;
CREATE POLICY "Super admins can manage all list members"
  ON public.marketing_contact_list_members FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
