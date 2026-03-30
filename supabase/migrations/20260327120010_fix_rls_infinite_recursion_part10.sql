-- Company admins: use SECURITY DEFINER function
DROP POLICY IF EXISTS "Company admins can manage their order salespeople" ON public.order_salespeople;
CREATE POLICY "Company admins can manage their order salespeople"
ON public.order_salespeople FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_salespeople.order_id) = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_salespeople.order_id) = public.get_user_company_id(auth.uid())
);
