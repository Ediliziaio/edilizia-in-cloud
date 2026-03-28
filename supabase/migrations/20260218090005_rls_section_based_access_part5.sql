-- 3. order_status_history — log cambi stato visibile allo staff
CREATE POLICY "Staff can view their company order status history"
  ON public.order_status_history FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
  );
