-- 6. order_item_attachments — allegati agli articoli ordine
CREATE POLICY "Staff can view order item attachments if permitted"
  ON public.order_item_attachments FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_item_attachments.order_item_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
  );
