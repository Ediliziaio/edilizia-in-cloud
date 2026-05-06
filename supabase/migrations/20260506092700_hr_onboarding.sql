-- MP-HR-01 — Onboarding Dipendente Automatizzato
-- ════════════════════════════════════════════════════════════════════════════
-- Da assunzione a primo giorno cantiere senza pratiche manuali:
-- contratto CCNL → UNILAV → INPS/INAIL → visita medica → formazione 16h →
-- DPI → portale dipendente → notifica capomastro.
--
-- Estende employees + nuova tabella hr_onboarding_steps (audit per-step).
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Estensione employees
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'pending'
    CHECK (onboarding_status IN (
      'pending','contract_generated','unilav_sent','medical_scheduled',
      'training_scheduled','dpi_delivered','portal_active','completed','blocked'
    )),
  ADD COLUMN IF NOT EXISTS onboarding_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ccnl_applicato text,
  ADD COLUMN IF NOT EXISTS livello_inquadramento text,
  ADD COLUMN IF NOT EXISTS qualifica text,
  ADD COLUMN IF NOT EXISTS data_assunzione date,
  ADD COLUMN IF NOT EXISTS data_inizio_lavoro date,
  ADD COLUMN IF NOT EXISTS retribuzione_lorda_annua numeric(10,2),
  ADD COLUMN IF NOT EXISTS ore_settimana int DEFAULT 40,
  -- Documenti
  ADD COLUMN IF NOT EXISTS contratto_storage_path text,
  ADD COLUMN IF NOT EXISTS unilav_storage_path text,
  ADD COLUMN IF NOT EXISTS unilav_protocollo text,
  ADD COLUMN IF NOT EXISTS unilav_inviato_at timestamptz,
  -- Visita medica
  ADD COLUMN IF NOT EXISTS visita_medica_data date,
  ADD COLUMN IF NOT EXISTS visita_medica_esito text,
  ADD COLUMN IF NOT EXISTS visita_medica_storage_path text,
  -- Formazione
  ADD COLUMN IF NOT EXISTS formazione_sicurezza_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS formazione_sicurezza_data date,
  ADD COLUMN IF NOT EXISTS formazione_sicurezza_attestato_path text,
  ADD COLUMN IF NOT EXISTS formazione_sicurezza_scadenza date,
  -- DPI
  ADD COLUMN IF NOT EXISTS dpi_consegnati jsonb,
  ADD COLUMN IF NOT EXISTS dpi_consegna_data date,
  ADD COLUMN IF NOT EXISTS dpi_modulo_path text,
  -- Portale
  ADD COLUMN IF NOT EXISTS portal_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_credentials_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_employees_onboarding_pending
  ON public.employees(company_id, onboarding_status)
  WHERE onboarding_status NOT IN ('completed','blocked');

-- ────────────────────────────────────────────────────────────────────────────
-- 2) hr_onboarding_steps (audit per-step + retry)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_onboarding_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  step_key        text NOT NULL,
  step_order      int NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','in_progress','completed','failed','skipped'
  )),
  ai_generated_content text,
  document_path   text,
  external_reference text,
  error_message   text,
  retries         int NOT NULL DEFAULT 0,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_step UNIQUE (employee_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_hr_steps_employee
  ON public.hr_onboarding_steps(employee_id, step_order);
CREATE INDEX IF NOT EXISTS idx_hr_steps_pending
  ON public.hr_onboarding_steps(status, created_at) WHERE status IN ('pending','in_progress','failed');

ALTER TABLE public.hr_onboarding_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_steps_company ON public.hr_onboarding_steps;
CREATE POLICY hr_steps_company ON public.hr_onboarding_steps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = hr_onboarding_steps.employee_id
       AND e.company_id = public.get_my_company_id()
  ));

DROP POLICY IF EXISTS hr_steps_admin ON public.hr_onboarding_steps;
CREATE POLICY hr_steps_admin ON public.hr_onboarding_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
       WHERE e.id = hr_onboarding_steps.employee_id
         AND e.company_id = public.get_my_company_id()
    )
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS hr_steps_super_admin ON public.hr_onboarding_steps;
CREATE POLICY hr_steps_super_admin ON public.hr_onboarding_steps FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_hr_steps_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_hr_steps_updated_at ON public.hr_onboarding_steps;
CREATE TRIGGER trg_hr_steps_updated_at
  BEFORE UPDATE ON public.hr_onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_hr_steps_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RPC: silvio_tool_avvia_onboarding (idempotente)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_avvia_onboarding(
  p_company_id uuid,
  p_user_id uuid,
  p_employee_id uuid,
  p_ccnl text DEFAULT 'CCNL Edilizia Industria',
  p_livello text DEFAULT NULL,
  p_qualifica text DEFAULT NULL,
  p_data_assunzione date DEFAULT NULL,
  p_ore_settimana int DEFAULT 40,
  p_ral_eur numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp RECORD;
  v_steps text[] := ARRAY[
    'contract_generation','unilav_sending','medical_scheduling',
    'training_scheduling','dpi_delivery','portal_activation'
  ];
  v_step text;
  v_idx int := 0;
BEGIN
  SELECT id, company_id, onboarding_status INTO v_emp
    FROM public.employees WHERE id = p_employee_id;

  IF v_emp IS NULL OR v_emp.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Employee non trovato');
  END IF;

  IF v_emp.onboarding_status = 'completed' THEN
    RETURN jsonb_build_object('error', 'Onboarding già completato');
  END IF;

  -- Aggiorna employee con dati contratto
  UPDATE public.employees
     SET onboarding_status = 'pending',
         onboarding_started_at = COALESCE(onboarding_started_at, NOW()),
         ccnl_applicato = COALESCE(p_ccnl, ccnl_applicato),
         livello_inquadramento = COALESCE(p_livello, livello_inquadramento),
         qualifica = COALESCE(p_qualifica, qualifica),
         data_assunzione = COALESCE(p_data_assunzione, data_assunzione, CURRENT_DATE),
         ore_settimana = COALESCE(p_ore_settimana, ore_settimana),
         retribuzione_lorda_annua = COALESCE(p_ral_eur, retribuzione_lorda_annua)
   WHERE id = p_employee_id;

  -- Crea record steps (idempotente)
  FOREACH v_step IN ARRAY v_steps LOOP
    v_idx := v_idx + 1;
    INSERT INTO public.hr_onboarding_steps (employee_id, step_key, step_order, status)
    VALUES (p_employee_id, v_step, v_idx, 'pending')
    ON CONFLICT (employee_id, step_key) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', p_employee_id,
    'steps_created', array_length(v_steps, 1),
    'message', format('Onboarding avviato per %s (CCNL: %s, livello: %s)',
      p_employee_id, p_ccnl, COALESCE(p_livello, 'n/a'))
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_avvia_onboarding(uuid, uuid, uuid, text, text, text, date, int, numeric)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_avvia_onboarding(uuid, uuid, uuid, text, text, text, date, int, numeric)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RPC: silvio_tool_aggiorna_step_onboarding
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_aggiorna_step_onboarding(
  p_company_id uuid,
  p_user_id uuid,
  p_employee_id uuid,
  p_step_key text,
  p_status text,
  p_document_path text DEFAULT NULL,
  p_external_reference text DEFAULT NULL,
  p_ai_content text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step_id uuid;
  v_completed_at timestamptz;
BEGIN
  -- Verifica employee company
  IF NOT EXISTS (
    SELECT 1 FROM public.employees
     WHERE id = p_employee_id AND company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object('error', 'Employee non trovato per questa azienda');
  END IF;

  v_completed_at := CASE WHEN p_status = 'completed' THEN NOW() ELSE NULL END;

  UPDATE public.hr_onboarding_steps
     SET status = p_status,
         document_path = COALESCE(p_document_path, document_path),
         external_reference = COALESCE(p_external_reference, external_reference),
         ai_generated_content = COALESCE(p_ai_content, ai_generated_content),
         error_message = p_error_message,
         retries = CASE WHEN p_status = 'failed' THEN retries + 1 ELSE retries END,
         completed_at = COALESCE(v_completed_at, completed_at),
         updated_at = NOW()
   WHERE employee_id = p_employee_id AND step_key = p_step_key
   RETURNING id INTO v_step_id;

  IF v_step_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Step non trovato');
  END IF;

  -- Aggiorna employee.onboarding_status secondo lo step più avanzato completed
  IF p_status = 'completed' THEN
    UPDATE public.employees e
       SET onboarding_status = CASE p_step_key
             WHEN 'contract_generation' THEN 'contract_generated'
             WHEN 'unilav_sending' THEN 'unilav_sent'
             WHEN 'medical_scheduling' THEN 'medical_scheduled'
             WHEN 'training_scheduling' THEN 'training_scheduled'
             WHEN 'dpi_delivery' THEN 'dpi_delivered'
             WHEN 'portal_activation' THEN 'portal_active'
             ELSE e.onboarding_status
           END
     WHERE e.id = p_employee_id;

    -- Check completion globale
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_onboarding_steps
       WHERE employee_id = p_employee_id AND status NOT IN ('completed','skipped')
    ) THEN
      UPDATE public.employees
         SET onboarding_status = 'completed',
             onboarding_completed_at = NOW()
       WHERE id = p_employee_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'step_id', v_step_id, 'status', p_status);
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_aggiorna_step_onboarding(uuid, uuid, uuid, text, text, text, text, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_aggiorna_step_onboarding(uuid, uuid, uuid, text, text, text, text, text, text)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) RPC: silvio_tool_lista_onboarding_in_corso
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_onboarding_in_corso(
  p_company_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'employees', COALESCE(jsonb_agg(
      jsonb_build_object(
        'employee_id', e.id,
        'full_name', COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,''),
        'qualifica', e.qualifica,
        'ccnl', e.ccnl_applicato,
        'data_assunzione', e.data_assunzione,
        'onboarding_status', e.onboarding_status,
        'onboarding_started_at', e.onboarding_started_at,
        'steps_completed', (
          SELECT COUNT(*) FROM public.hr_onboarding_steps s
           WHERE s.employee_id = e.id AND s.status = 'completed'
        ),
        'steps_total', (
          SELECT COUNT(*) FROM public.hr_onboarding_steps s
           WHERE s.employee_id = e.id
        ),
        'has_failed_steps', EXISTS (
          SELECT 1 FROM public.hr_onboarding_steps s
           WHERE s.employee_id = e.id AND s.status = 'failed'
        )
      ) ORDER BY e.onboarding_started_at DESC NULLS LAST
    ) FILTER (WHERE e.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.employees e
  WHERE e.company_id = p_company_id
    AND e.onboarding_status NOT IN ('completed','blocked')
    AND e.onboarding_started_at IS NOT NULL;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'employees', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_onboarding_in_corso(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_onboarding_in_corso(uuid, uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) RPC: silvio_tool_verifica_completion_onboarding
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_verifica_completion_onboarding(
  p_company_id uuid,
  p_user_id uuid,
  p_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp RECORD;
  v_checklist jsonb;
BEGIN
  SELECT id, company_id, onboarding_status,
         contratto_storage_path, unilav_inviato_at, visita_medica_data,
         formazione_sicurezza_completed, dpi_consegna_data, portal_user_id
    INTO v_emp
    FROM public.employees WHERE id = p_employee_id;

  IF v_emp IS NULL OR v_emp.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Employee non trovato');
  END IF;

  v_checklist := jsonb_build_object(
    'contratto_firmato', v_emp.contratto_storage_path IS NOT NULL,
    'unilav_inviato', v_emp.unilav_inviato_at IS NOT NULL,
    'visita_medica_fatta', v_emp.visita_medica_data IS NOT NULL,
    'formazione_completata', v_emp.formazione_sicurezza_completed,
    'dpi_consegnati', v_emp.dpi_consegna_data IS NOT NULL,
    'portale_attivo', v_emp.portal_user_id IS NOT NULL
  );

  RETURN jsonb_build_object(
    'employee_id', p_employee_id,
    'onboarding_status', v_emp.onboarding_status,
    'checklist', v_checklist,
    'all_complete', NOT EXISTS (
      SELECT 1 FROM jsonb_each_text(v_checklist) AS kv WHERE kv.value = 'false'
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_verifica_completion_onboarding(uuid, uuid, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_verifica_completion_onboarding(uuid, uuid, uuid)
  TO service_role;
