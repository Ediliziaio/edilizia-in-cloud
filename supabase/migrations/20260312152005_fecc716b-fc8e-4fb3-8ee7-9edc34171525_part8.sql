-- Admin-only write access
DROP POLICY IF EXISTS "billing_integrations_admin_modify" ON public.billing_integrations;
CREATE POLICY "billing_integrations_admin_modify"
ON public.billing_integrations
FOR ALL
TO authenticated
USING (
  (company_id = public.get_user_company_id(auth.uid())
   AND public.has_role(auth.uid(), 'company_admin'))
  OR public.has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  (company_id = public.get_user_company_id(auth.uid())
   AND public.has_role(auth.uid(), 'company_admin'))
  OR public.has_role(auth.uid(), 'super_admin')
);
