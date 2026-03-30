DROP POLICY IF EXISTS "Company admins can manage their order history" ON public.order_status_history;
CREATE POLICY "Company admins can manage their order history"
ON public.order_status_history FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_status_history.order_id) = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_status_history.order_id) = public.get_user_company_id(auth.uid())
);
