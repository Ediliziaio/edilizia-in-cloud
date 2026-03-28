-- Dipendenti vedono i propri allegati (buste paga, documenti, ecc.)
CREATE POLICY "Employees can view their own attachments"
  ON public.employee_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_attachments.employee_id
        AND e.user_id = auth.uid()
    )
  );
