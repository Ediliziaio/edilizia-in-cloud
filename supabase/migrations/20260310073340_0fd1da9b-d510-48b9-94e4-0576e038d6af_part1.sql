-- Allow customers to view invoices linked to their orders
DROP POLICY IF EXISTS "customer_view_own_invoices" ON public.invoices;
CREATE POLICY "customer_view_own_invoices"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    client_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = invoices.order_id
        AND o.customer_id = auth.uid()
    )
  );
