-- RLS: admin/staff scrive
CREATE POLICY "leave_balances_write"
  ON public.leave_balances FOR ALL
  USING (
    company_id = public.get_my_company_id()
  );
