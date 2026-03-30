-- Employees see items of orders they are assigned to
DROP POLICY IF EXISTS "Employees can view items of their assigned orders" ON public.order_items;
CREATE POLICY "Employees can view items of their assigned orders"
ON public.order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.order_employees oe
    JOIN public.employees e ON e.id = oe.employee_id
    WHERE oe.order_id = order_items.order_id
      AND e.user_id = auth.uid()
  )
);
