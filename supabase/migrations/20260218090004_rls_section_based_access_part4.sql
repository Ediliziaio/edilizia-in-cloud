-- 2. order_statuses — necessari per visualizzare i nomi degli stati (Kanban)
CREATE POLICY "Staff can view their company order statuses"
  ON public.order_statuses FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND company_id = get_user_company_id(auth.uid())
  );
