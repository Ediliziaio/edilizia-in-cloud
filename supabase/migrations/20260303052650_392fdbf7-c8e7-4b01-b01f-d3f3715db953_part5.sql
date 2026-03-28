-- INSERT: only admins
CREATE POLICY "Admins can insert sales targets"
ON public.sales_targets FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
  AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin'))
);
