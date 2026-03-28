CREATE POLICY "Super admins can manage all order salespeople"
ON public.order_salespeople FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
