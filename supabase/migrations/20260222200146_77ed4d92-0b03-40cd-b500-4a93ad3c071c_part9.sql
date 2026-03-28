CREATE POLICY "Super admins can manage all calendar availability"
  ON public.marketing_calendar_availability FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
