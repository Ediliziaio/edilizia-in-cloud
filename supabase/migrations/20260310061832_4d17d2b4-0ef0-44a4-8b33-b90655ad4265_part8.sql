-- RLS: dipendente aggiorna le proprie pending OPPURE admin/staff aggiorna qualsiasi
DROP POLICY IF EXISTS "employee_update_leave" ON public.leave_requests;
CREATE POLICY "employee_update_leave"
  ON public.leave_requests FOR UPDATE
  USING (
    (
      employee_id IN (
        SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid()
      )
      AND status = 'pending'
    )
    OR
    company_id = public.get_my_company_id()
  );
