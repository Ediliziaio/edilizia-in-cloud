-- Dipendenti vedono gli ordini a cui sono assegnati
CREATE POLICY "Employees can view their assigned orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_employees oe
      JOIN public.employees e ON e.id = oe.employee_id
      WHERE oe.order_id = orders.id
        AND e.user_id = auth.uid()
    )
  );
