-- Audit log dei commercialisti: traccia ogni navigazione/operazione
-- per compliance fiscale + GDPR.
--
-- Versione SEMPLICE: usa solo companies.owner_user_id (sempre presente).
-- Niente dipendenze da company_members o multi_company_access (i loro
-- nomi di colonna variano fra installazioni Supabase).

DROP POLICY IF EXISTS "audit_log_accountant_insert" ON public.accountant_audit_log;
DROP POLICY IF EXISTS "audit_log_accountant_select_own" ON public.accountant_audit_log;
DROP POLICY IF EXISTS "audit_log_company_owner_select" ON public.accountant_audit_log;
DROP POLICY IF EXISTS "audit_log_multi_company_select" ON public.accountant_audit_log;

CREATE TABLE IF NOT EXISTS public.accountant_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id uuid REFERENCES public.accountant_firms(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action text NOT NULL,
  resource_type text,
  resource_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accountant_audit_log_company_at_idx
  ON public.accountant_audit_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS accountant_audit_log_user_at_idx
  ON public.accountant_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS accountant_audit_log_action_idx
  ON public.accountant_audit_log (action, created_at DESC);

ALTER TABLE public.accountant_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_accountant_insert" ON public.accountant_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_can_read_accountant_company(company_id)
  );

CREATE POLICY "audit_log_accountant_select_own" ON public.accountant_audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "audit_log_company_owner_select" ON public.accountant_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = accountant_audit_log.company_id
        AND c.owner_user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.accountant_audit_log IS
  'Traccia accessi e operazioni commercialista per compliance fiscale + GDPR.';
