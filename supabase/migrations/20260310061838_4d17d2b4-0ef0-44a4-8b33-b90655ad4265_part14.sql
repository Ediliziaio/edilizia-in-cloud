-- RLS: admin/staff scrive
DROP POLICY IF EXISTS "leave_balances_write" ON public.leave_balances;
CREATE POLICY "leave_balances_write"
  ON public.leave_balances FOR ALL
  USING (
    company_id = public.get_my_company_id()
  );
