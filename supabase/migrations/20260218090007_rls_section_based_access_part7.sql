-- Dipendenti vedono le proprie assegnazioni
DROP POLICY IF EXISTS "Employees can view their own order assignments" ON public.order_employees;
CREATE POLICY "Employees can view their own order assignments"
  ON public.order_employees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = order_employees.employee_id
        AND e.user_id = auth.uid()
    )
  );
