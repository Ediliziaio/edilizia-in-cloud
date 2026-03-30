DROP POLICY IF EXISTS "Company admins can manage their order salespeople" ON public.order_salespeople;
CREATE POLICY "Company admins can manage their order salespeople"
ON public.order_salespeople FOR ALL TO authenticated
USING (has_role(auth.uid(), 'company_admin'::app_role) AND EXISTS (
  SELECT 1 FROM orders o WHERE o.id = order_salespeople.order_id AND o.company_id = get_user_company_id(auth.uid())
))
WITH CHECK (has_role(auth.uid(), 'company_admin'::app_role) AND EXISTS (
  SELECT 1 FROM orders o WHERE o.id = order_salespeople.order_id AND o.company_id = get_user_company_id(auth.uid())
));
