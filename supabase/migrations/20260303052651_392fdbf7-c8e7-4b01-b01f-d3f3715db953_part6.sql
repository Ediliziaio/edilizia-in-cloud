-- UPDATE: only admins
DROP POLICY IF EXISTS "Admins can update sales targets" ON public.sales_targets;
CREATE POLICY "Admins can update sales targets"
ON public.sales_targets FOR UPDATE
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin'))
);
