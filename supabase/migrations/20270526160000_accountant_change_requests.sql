-- Approval workflow per access_mode='approval_required'.
--
-- Quando il commercialista (con access_mode='approval_required') vuole
-- modificare qualcosa dell'azienda, invece di scrivere direttamente sulla
-- tabella reale crea una RICHIESTA che l'azienda approverà o rifiuterà.
--
-- Schema:
--  - resource_type: 'prima_nota' | 'scadenza' | 'costo' | 'doc_fiscale' | ...
--  - operation: 'create' | 'update' | 'delete'
--  - payload: JSONB con i dati proposti
--  - status: 'pending' | 'approved' | 'rejected'
--  - decided_by + decided_at + decision_note

CREATE TABLE IF NOT EXISTS public.accountant_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id uuid REFERENCES public.accountant_firms(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  operation text NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accountant_change_requests_company_status_idx
  ON public.accountant_change_requests (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS accountant_change_requests_requested_by_idx
  ON public.accountant_change_requests (requested_by, created_at DESC);

ALTER TABLE public.accountant_change_requests ENABLE ROW LEVEL SECURITY;

-- INSERT: il commercialista può inserire richieste per company a cui ha accesso
DROP POLICY IF EXISTS "change_req_accountant_insert" ON public.accountant_change_requests;
CREATE POLICY "change_req_accountant_insert" ON public.accountant_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND public.user_can_read_accountant_company(company_id)
  );

-- SELECT: il commercialista vede le proprie richieste, l'azienda vede quelle che riceve
DROP POLICY IF EXISTS "change_req_accountant_select_own" ON public.accountant_change_requests;
CREATE POLICY "change_req_accountant_select_own" ON public.accountant_change_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid());

DROP POLICY IF EXISTS "change_req_company_owner_select" ON public.accountant_change_requests;
CREATE POLICY "change_req_company_owner_select" ON public.accountant_change_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = accountant_change_requests.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = accountant_change_requests.company_id
        AND c.owner_user_id = auth.uid()
    )
  );

-- UPDATE: solo l'azienda owner/admin può decidere (approve/reject)
DROP POLICY IF EXISTS "change_req_company_decide" ON public.accountant_change_requests;
CREATE POLICY "change_req_company_decide" ON public.accountant_change_requests
  FOR UPDATE TO authenticated
  USING (
    status = 'pending' AND (
      EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = accountant_change_requests.company_id
          AND cm.user_id = auth.uid()
          AND cm.role IN ('admin', 'owner')
      )
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = accountant_change_requests.company_id
          AND c.owner_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    status IN ('approved', 'rejected')
    AND decided_by = auth.uid()
  );

COMMENT ON TABLE public.accountant_change_requests IS
  'Coda di approvazione per modifiche del commercialista quando access_mode=approval_required. L''azienda approva/rifiuta entro 7 giorni (poi expired).';
