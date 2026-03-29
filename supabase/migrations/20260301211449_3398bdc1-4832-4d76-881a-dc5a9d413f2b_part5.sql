CREATE POLICY "Company users view own notifications"
ON public.lifecycle_notifications FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()));
