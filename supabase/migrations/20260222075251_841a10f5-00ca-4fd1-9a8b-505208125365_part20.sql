DROP POLICY IF EXISTS "Super admins can manage all contact activities" ON public.marketing_contact_activities;
CREATE POLICY "Super admins can manage all contact activities"
  ON public.marketing_contact_activities FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
