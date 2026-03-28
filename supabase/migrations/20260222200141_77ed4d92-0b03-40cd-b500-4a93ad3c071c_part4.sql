CREATE POLICY "Super admins can manage all marketing calendars"
  ON public.marketing_calendars FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
