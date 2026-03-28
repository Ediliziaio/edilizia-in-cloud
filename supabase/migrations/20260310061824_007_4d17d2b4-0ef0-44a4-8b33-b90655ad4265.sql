-- RLS: dipendente inserisce le proprie (solo pending)
CREATE POLICY "employee_insert_own_leave"
  ON public.leave_requests FOR INSERT
  WITH CHECK (
    employee_id IN (
      SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid()
    )
    AND status = 'pending'
    AND company_id = public.get_my_company_id()
  );
