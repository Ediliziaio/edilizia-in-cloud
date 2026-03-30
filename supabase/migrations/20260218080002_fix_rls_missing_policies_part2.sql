-- Dipendenti (ruolo employee) possono vedere gli articoli degli ordini
-- a cui sono assegnati tramite order_employees
DROP POLICY IF EXISTS "Employees can view items of their assigned orders" ON public.order_items;
CREATE POLICY "Employees can view items of their assigned orders"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.order_employees oe
      JOIN public.employees e ON e.id = oe.employee_id
      WHERE e.user_id = auth.uid()
        AND oe.order_id = order_items.order_id
    )
  );
