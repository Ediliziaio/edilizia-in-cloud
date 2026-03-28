-- INSERT for service (via edge functions with service role, so no user-facing insert policy needed)
-- Super admin full access for SELECT/UPDATE/DELETE
CREATE POLICY "Super admin manage whatsapp_credits_log"
  ON public.whatsapp_credits_log
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
