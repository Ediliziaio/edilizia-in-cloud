-- RLS: dipendente legge i propri, admin/staff legge tutti della company
CREATE POLICY "leave_balances_read"
  ON public.leave_balances FOR SELECT
  USING (
    employee_id IN (
      SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid()
    )
    OR
    company_id = public.get_my_company_id()
  );
