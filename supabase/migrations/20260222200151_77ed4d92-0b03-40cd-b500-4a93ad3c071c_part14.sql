DROP POLICY IF EXISTS "Super admins can manage all calendar preferences" ON public.marketing_calendar_preferences;
CREATE POLICY "Super admins can manage all calendar preferences"
  ON public.marketing_calendar_preferences FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
