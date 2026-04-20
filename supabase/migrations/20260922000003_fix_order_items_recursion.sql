-- ============================================================================
-- Fix infinite recursion on orders (SQLSTATE 42P17)
-- ============================================================================
-- Ciclo individuato:
--   orders.orders_warehouse_user_view
--     → EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id ...)
--   order_items."Staff can manage order items if permitted"
--     → EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id ...)
--
-- Per valutare i row di `orders` Postgres espande tutte le policy; la policy
-- warehouse attiva una subquery su `order_items`, che a sua volta attiva una
-- subquery su `orders` → loop. Il fix è identico al pattern già usato per
-- order_employees / order_salespeople: sostituire la subquery diretta con la
-- helper SECURITY DEFINER `get_order_company_id()`, che legge orders
-- bypassando la RLS.
--
-- Questo cambia SOLO la policy `Staff can manage order items if permitted` su
-- order_items. Non tocca nient'altro, in particolare lascia intatte tutte le
-- policy di orders / order_employees / order_salespeople che funzionano già
-- correttamente.
-- ============================================================================

DROP POLICY IF EXISTS "Staff can manage order items if permitted" ON public.order_items;

CREATE POLICY "Staff can manage order items if permitted"
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (
    has_permission(auth.uid(), 'can_edit_orders'::text)
    AND public.get_order_company_id(order_id) = public.get_user_company_id(auth.uid())
  )
  WITH CHECK (
    has_permission(auth.uid(), 'can_edit_orders'::text)
    AND public.get_order_company_id(order_id) = public.get_user_company_id(auth.uid())
  );
