-- Policies for api_usage_daily
CREATE POLICY "Company reads own api daily stats"
ON public.api_usage_daily FOR SELECT TO authenticated
USING (
  company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
