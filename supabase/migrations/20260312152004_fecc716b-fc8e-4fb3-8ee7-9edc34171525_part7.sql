-- Admin-only read access (company_admin + super_admin)
CREATE POLICY "billing_integrations_admin_select"
ON public.billing_integrations
FOR SELECT
TO authenticated
USING (
  (company_id = public.get_user_company_id(auth.uid())
   AND public.has_role(auth.uid(), 'company_admin'))
  OR public.has_role(auth.uid(), 'super_admin')
);
