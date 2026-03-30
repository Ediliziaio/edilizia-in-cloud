DROP POLICY IF EXISTS "Super admins full access phone_number_sms_usage" ON public.phone_number_sms_usage;
CREATE POLICY "Super admins full access phone_number_sms_usage"
  ON public.phone_number_sms_usage FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
