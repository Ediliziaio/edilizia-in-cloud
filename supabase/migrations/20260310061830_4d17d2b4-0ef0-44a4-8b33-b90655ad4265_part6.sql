-- RLS: dipendente vede le proprie
DROP POLICY IF EXISTS "employee_own_leave_select" ON public.leave_requests;
CREATE POLICY "employee_own_leave_select"
  ON public.leave_requests FOR SELECT
  USING (
    employee_id IN (
      SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid()
    )
    OR
    company_id = public.get_my_company_id()
  );
