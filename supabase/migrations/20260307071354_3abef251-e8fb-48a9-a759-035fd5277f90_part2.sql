DROP POLICY IF EXISTS "Super admin full access on email_credits" ON public.email_credits;
CREATE POLICY "Super admin full access on email_credits"
  ON public.email_credits FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
