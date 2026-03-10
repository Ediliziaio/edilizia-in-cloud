
-- Allow customers to view installments for their own orders
CREATE POLICY "customer_view_own_installments"
  ON public.order_installments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_installments.order_id
        AND o.customer_id = auth.uid()
    )
  );

-- Allow customers to view invoices linked to their orders
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
