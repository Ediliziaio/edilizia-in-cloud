CREATE POLICY "service_role_admin_invites"
  ON public.admin_invites FOR ALL
  USING (auth.role() = 'service_role');
