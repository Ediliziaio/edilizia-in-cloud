-- Approval workflow per access_mode='approval_required'.
--
-- Versione MINIMALE che funziona su qualsiasi schema: solo policy
-- commercialista (insert + select dei propri). Le policy "azienda
-- vede + approva/rifiuta" verranno aggiunte separatamente dopo aver
-- identificato il nome corretto della colonna owner in public.companies.

DROP TABLE IF EXISTS public.accountant_change_requests CASCADE;

CREATE TABLE public.accountant_change_requests (
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

CREATE INDEX accountant_change_requests_company_status_idx
  ON public.accountant_change_requests (company_id, status, created_at DESC);
CREATE INDEX accountant_change_requests_requested_by_idx
  ON public.accountant_change_requests (requested_by, created_at DESC);

ALTER TABLE public.accountant_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "change_req_accountant_insert" ON public.accountant_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND public.user_can_read_accountant_company(company_id)
  );

CREATE POLICY "change_req_accountant_select_own" ON public.accountant_change_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid());

COMMENT ON TABLE public.accountant_change_requests IS
  'Coda di approvazione per modifiche del commercialista quando access_mode=approval_required.';
