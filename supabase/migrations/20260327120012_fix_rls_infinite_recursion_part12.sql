-- Salespeople see their own commissions (no orders reference → no recursion)
DROP POLICY IF EXISTS "Salespeople can view their commissions" ON public.order_salespeople;
CREATE POLICY "Salespeople can view their commissions"
ON public.order_salespeople FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.salespeople s
    WHERE s.id = order_salespeople.salesperson_id
      AND s.user_id = auth.uid()
  )
);
