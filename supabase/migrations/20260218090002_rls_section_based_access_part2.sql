-- Venditori vedono gli ordini su cui sono assegnati
DROP POLICY IF EXISTS "Salespeople can view their assigned orders" ON public.orders;
CREATE POLICY "Salespeople can view their assigned orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_salespeople os
      JOIN public.salespeople s ON s.id = os.salesperson_id
      WHERE os.order_id = orders.id
        AND s.user_id = auth.uid()
    )
  );
