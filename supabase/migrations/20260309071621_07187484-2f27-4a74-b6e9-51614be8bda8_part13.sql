-- Policies for api_usage_log
CREATE POLICY "Company reads own api usage"
ON public.api_usage_log FOR SELECT TO authenticated
USING (
  company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
