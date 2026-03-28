-- Company staff con permesso can_edit_orders può gestire gli articoli
-- degli ordini della propria azienda
CREATE POLICY "Staff can manage order items if permitted"
  ON public.order_items FOR ALL
  USING (
    has_permission(auth.uid(), 'can_edit_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
  );
