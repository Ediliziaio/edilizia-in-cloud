DROP POLICY IF EXISTS "Super admins can manage all marketing contacts" ON public.marketing_contacts;
CREATE POLICY "Super admins can manage all marketing contacts"
ON public.marketing_contacts
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
