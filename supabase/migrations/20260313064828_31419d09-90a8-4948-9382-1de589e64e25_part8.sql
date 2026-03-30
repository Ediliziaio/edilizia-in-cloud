DROP POLICY IF EXISTS "company_isolation_reconciliation_log" ON public.anagrafica_reconciliation_log;
CREATE POLICY "company_isolation_reconciliation_log"
  ON anagrafica_reconciliation_log
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
