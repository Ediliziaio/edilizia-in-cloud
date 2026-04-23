-- =============================================================================
-- P1-3 — Tabella audit risposte provider SDI (Aruba in primis)
-- =============================================================================
-- Risolve il bug P1 "invia-sdi: fake sdiId con UUID random": se Aruba
-- risponde con chiave JSON diversa da quelle attese (uploadFileName /
-- idSdi / id), il codice generava crypto.randomUUID() come "sdi_id" e
-- marcava la fattura come inviata. In realtà il cliente non aveva modo di
-- tracciare lo stato della fattura reale presso SDI.
--
-- Questa tabella conserva la risposta raw di ogni invio, con la lista
-- delle chiavi rilevate dal JSON. Serve a:
--   1. Scoprire quando Aruba cambia formato di risposta (nuova chiave).
--   2. Ricostruire l'sdi_id reale se serve manualmente.
--   3. Audit trail per fatturazione elettronica (requisito legale).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sdi_provider_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  documento_id uuid,
  provider text NOT NULL,
  endpoint text,
  status_code int,
  response_json jsonb,
  detected_keys text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sdi_provider_responses IS
  'P1-3: audit risposte provider SDI. Loggato ad ogni invio fattura elettronica (Aruba, altri provider) per tracking ID reale + detection cambi di formato.';

CREATE INDEX IF NOT EXISTS idx_sdi_resp_provider
  ON public.sdi_provider_responses (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sdi_resp_documento
  ON public.sdi_provider_responses (documento_id)
  WHERE documento_id IS NOT NULL;

ALTER TABLE public.sdi_provider_responses ENABLE ROW LEVEL SECURITY;

-- Solo super_admin può leggere l'audit: operativo/diagnostico.
-- Le edge function usano service_role e bypassano le policy.
DROP POLICY IF EXISTS sdi_resp_admin_select ON public.sdi_provider_responses;
CREATE POLICY sdi_resp_admin_select ON public.sdi_provider_responses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Nessuna policy INSERT/UPDATE/DELETE: scritture solo via service_role.
