-- Employees can see their own assignments
CREATE POLICY "Employees can view their own order assignments"
ON public.order_employees FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = order_employees.employee_id
      AND e.user_id = auth.uid()
  )
);
