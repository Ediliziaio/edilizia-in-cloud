-- Audit log dei commercialisti: traccia ogni navigazione/operazione
-- per compliance fiscale + GDPR.
--
-- Schema minimal: client-side INSERT al cambio route + edge function
-- nascosta per export CSV. La INSERT è permessa solo per accountant
-- attivo sulla company target.

CREATE TABLE IF NOT EXISTS public.accountant_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id uuid REFERENCES public.accountant_firms(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action text NOT NULL,
  -- es: 'view_dashboard', 'view_orders', 'view_invoice', 'export_csv',
  --     'create_prima_nota', 'update_scadenza', 'delete_doc'
  resource_type text,    -- es: 'order', 'invoice', 'scadenza'
  resource_id uuid,      -- ID specifico della risorsa, se applicabile
  metadata jsonb DEFAULT '{}'::jsonb,  -- contesto extra (es: filter, payload)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indici per performance query future
CREATE INDEX IF NOT EXISTS accountant_audit_log_company_at_idx
  ON public.accountant_audit_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS accountant_audit_log_user_at_idx
  ON public.accountant_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS accountant_audit_log_action_idx
  ON public.accountant_audit_log (action, created_at DESC);

ALTER TABLE public.accountant_audit_log ENABLE ROW LEVEL SECURITY;

-- Il commercialista può inserire log SOLO per company a cui ha accesso
DROP POLICY IF EXISTS "audit_log_accountant_insert" ON public.accountant_audit_log;
CREATE POLICY "audit_log_accountant_insert" ON public.accountant_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_can_read_accountant_company(company_id)
  );

-- Il commercialista può leggere SOLO i propri log
DROP POLICY IF EXISTS "audit_log_accountant_select_own" ON public.accountant_audit_log;
CREATE POLICY "audit_log_accountant_select_own" ON public.accountant_audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- L'azienda può leggere TUTTI i log dei commercialisti che hanno accesso
-- alla sua company (per compliance e audit interno)
DROP POLICY IF EXISTS "audit_log_company_owner_select" ON public.accountant_audit_log;
CREATE POLICY "audit_log_company_owner_select" ON public.accountant_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = accountant_audit_log.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = accountant_audit_log.company_id
        AND c.owner_user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.accountant_audit_log IS
  'Traccia accessi e operazioni commercialista per compliance fiscale + GDPR. INSERT da client commercialista, SELECT da commercialista (i propri) e azienda (i propri company).';
