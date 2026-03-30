-- 5. order_attachments — allegati a livello ordine
DROP POLICY IF EXISTS "Staff can view order attachments if permitted" ON public.order_attachments;
CREATE POLICY "Staff can view order attachments if permitted"
  ON public.order_attachments FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_attachments.order_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
  );
