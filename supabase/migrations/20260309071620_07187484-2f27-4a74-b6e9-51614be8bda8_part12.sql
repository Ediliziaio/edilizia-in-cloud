-- Policies for api_keys
CREATE POLICY "Company admins manage own api keys"
ON public.api_keys FOR ALL TO authenticated
USING (
  company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
