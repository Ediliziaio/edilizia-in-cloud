-- Super admin full access
DROP POLICY IF EXISTS "Super admin full access contact_messages" ON public.contact_messages;
CREATE POLICY "Super admin full access contact_messages" ON public.contact_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));
