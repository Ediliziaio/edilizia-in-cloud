CREATE POLICY "Salespeople can view their commissions"
ON public.order_salespeople FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM salespeople s WHERE s.id = order_salespeople.salesperson_id AND s.user_id = auth.uid()
));
