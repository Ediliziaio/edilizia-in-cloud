-- ============================================================================
-- Fix ciclo RLS latente `order_attachments ↔ orders`
-- ============================================================================
-- Stesso pattern fixato su order_items il 22/09: 3 policy di order_attachments
-- fanno `EXISTS (SELECT ... FROM orders o WHERE o.id = order_attachments.order_id)`.
-- Con la policy `orders_warehouse_user_view` che chiude il loop su order_items,
-- basta un order con attachments visibili a un warehouse user per rianimare
-- il ciclo 42P17.
--
-- Fix: sostituire le subquery dirette con helper SECURITY DEFINER già esistenti:
--   - get_order_company_id(order_id) → per company_id
--   - get_order_customer_id(order_id) → per customer_id (migration 20260327120018)
-- ============================================================================

DROP POLICY IF EXISTS "Company admins can manage their order attachments" ON public.order_attachments;
CREATE POLICY "Company admins can manage their order attachments"
  ON public.order_attachments
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin'::app_role)
    AND public.get_order_company_id(order_id) = public.get_user_company_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'company_admin'::app_role)
    AND public.get_order_company_id(order_id) = public.get_user_company_id(auth.uid())
  );

DROP POLICY IF EXISTS "Staff can view order attachments if permitted" ON public.order_attachments;
CREATE POLICY "Staff can view order attachments if permitted"
  ON public.order_attachments
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'can_view_orders'::text)
    AND public.get_order_company_id(order_id) = public.get_user_company_id(auth.uid())
  );

DROP POLICY IF EXISTS "Customers can view visible order attachments" ON public.order_attachments;
CREATE POLICY "Customers can view visible order attachments"
  ON public.order_attachments
  FOR SELECT
  TO authenticated
  USING (
    visible_to_customer = true
    AND public.get_order_customer_id(order_id) = auth.uid()
  );
