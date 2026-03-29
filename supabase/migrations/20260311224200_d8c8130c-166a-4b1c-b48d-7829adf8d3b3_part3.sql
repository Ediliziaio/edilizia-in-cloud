CREATE POLICY "company_access_notif_prefs" ON public.user_notification_preferences
  FOR ALL USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );
