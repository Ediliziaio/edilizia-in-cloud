-- Policy "azienda admin" per accountant_audit_log e accountant_change_requests.
--
-- Dipende da public.multi_company_access (user_id, company_id, access_role)
-- che è la tabella canonica nel DB per legame user→company nel platform.
--
-- Riconosce come "azienda admin" i ruoli company_admin e super_admin.
-- Da eseguire DOPO le 2 migration 20270526130000 e 20270526160000
-- (creazione tabelle accountant_audit_log + accountant_change_requests).

-- AUDIT LOG: azienda admin vede log dei suoi commercialisti
DROP POLICY IF EXISTS "audit_log_company_admin_select" ON public.accountant_audit_log;
CREATE POLICY "audit_log_company_admin_select" ON public.accountant_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multi_company_access mca
      WHERE mca.company_id = accountant_audit_log.company_id
        AND mca.user_id = auth.uid()
        AND mca.access_role IN ('company_admin', 'super_admin')
    )
  );

-- CHANGE REQUESTS: azienda admin vede la coda
DROP POLICY IF EXISTS "change_req_company_admin_select" ON public.accountant_change_requests;
CREATE POLICY "change_req_company_admin_select" ON public.accountant_change_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multi_company_access mca
      WHERE mca.company_id = accountant_change_requests.company_id
        AND mca.user_id = auth.uid()
        AND mca.access_role IN ('company_admin', 'super_admin')
    )
  );

-- CHANGE REQUESTS: azienda admin approva/rifiuta richieste pending
DROP POLICY IF EXISTS "change_req_company_admin_decide" ON public.accountant_change_requests;
CREATE POLICY "change_req_company_admin_decide" ON public.accountant_change_requests
  FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.multi_company_access mca
      WHERE mca.company_id = accountant_change_requests.company_id
        AND mca.user_id = auth.uid()
        AND mca.access_role IN ('company_admin', 'super_admin')
    )
  )
  WITH CHECK (
    status IN ('approved', 'rejected')
    AND decided_by = auth.uid()
  );
