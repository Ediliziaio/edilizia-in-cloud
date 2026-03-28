-- Company admins
CREATE POLICY "Company admins can manage their order items"
ON public.order_items FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_items.order_id) = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND public.get_order_company_id(order_items.order_id) = public.get_user_company_id(auth.uid())
);
