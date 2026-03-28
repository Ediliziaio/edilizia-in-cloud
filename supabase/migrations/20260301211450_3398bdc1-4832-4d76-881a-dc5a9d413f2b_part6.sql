CREATE POLICY "Company users update own notifications"
ON public.lifecycle_notifications FOR UPDATE TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()))
WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
