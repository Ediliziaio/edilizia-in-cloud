-- SELECT: all company members can read
CREATE POLICY "Company members can view sales targets"
ON public.sales_targets FOR SELECT
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
);
