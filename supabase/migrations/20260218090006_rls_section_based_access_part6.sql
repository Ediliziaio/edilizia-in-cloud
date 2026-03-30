-- 4. order_employees — assegnazione dipendenti agli ordini
DROP POLICY IF EXISTS "Staff can view order employees if permitted" ON public.order_employees;
CREATE POLICY "Staff can view order employees if permitted"
  ON public.order_employees FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_employees.order_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
  );
