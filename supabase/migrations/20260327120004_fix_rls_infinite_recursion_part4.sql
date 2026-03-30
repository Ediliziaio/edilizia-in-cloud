-- Company admins: use SECURITY DEFINER function to get order company_id
DROP POLICY IF EXISTS "Company admins can manage their order employees" ON public.order_employees;
CREATE POLICY "Company admins can manage their order employees"
ON public.order_employees FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_employees.order_id) = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_employees.order_id) = public.get_user_company_id(auth.uid())
);
