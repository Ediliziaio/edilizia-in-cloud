-- MP-FAT-02 — Fatturazione Zero-Touch SAL→SDI→Reminder
-- ════════════════════════════════════════════════════════════════════════════
-- Orchestratore end-to-end automatico:
--   SAL approvato (o trigger manuale/cron) → fattura emessa → invio SDI →
--   notifica cliente → reminder pagamento (delegato a MP-FAT-01 v2 dunning).
--
-- State machine persistente in fatt_zero_touch_runs.steps_log per resume
-- idempotente dopo risposta SDI asincrona o crash edge function.
--
-- Defensive: tabella `sal` può non esistere su tutti i tenant — il trigger
-- viene creato condizionalmente.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fatt_zero_touch_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  trigger_source  text NOT NULL CHECK (trigger_source IN (
    'sal_approved','recurring_schedule','order_completed',
    'conversation','manual_ui'
  )),
  trigger_data    jsonb,

  -- Riferimenti
  sal_id          uuid,  -- FK opzionale (sal table può non esistere)
  order_id        uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invoice_id      uuid REFERENCES public.invoices(id) ON DELETE SET NULL,

  -- Stato pipeline
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','validating_anagrafica','composing_xml','awaiting_hitl_approval',
    'signing_p7m','sending_sdi','awaiting_sdi_response',
    'sdi_accepted','sdi_rejected','customer_notified',
    'completed','failed','cancelled'
  )),

  -- HITL
  hitl_required        boolean NOT NULL DEFAULT false,
  hitl_reason          text,
  action_proposal_id   uuid REFERENCES public.ai_action_proposals(id) ON DELETE SET NULL,

  -- AI
  ai_persona_used      text NOT NULL DEFAULT 'amministrazione',
  ai_cost_total_eur    numeric(10,4) NOT NULL DEFAULT 0,

  -- Esiti
  amount_total_eur     numeric(12,2),
  sdi_status           text,
  sdi_message_id       text,
  customer_notified_at timestamptz,
  customer_notification_channels text[],

  -- Audit trail
  steps_log            jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Errori + retry
  error_step           text,
  error_message        text,
  retries              int NOT NULL DEFAULT 0,
  next_retry_at        timestamptz,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_fzt_company_status
  ON public.fatt_zero_touch_runs(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fzt_pending_retry
  ON public.fatt_zero_touch_runs(next_retry_at)
  WHERE status NOT IN ('completed','failed','cancelled');
CREATE INDEX IF NOT EXISTS idx_fzt_invoice
  ON public.fatt_zero_touch_runs(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fzt_proposal
  ON public.fatt_zero_touch_runs(action_proposal_id) WHERE action_proposal_id IS NOT NULL;

ALTER TABLE public.fatt_zero_touch_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fzt_company_read ON public.fatt_zero_touch_runs;
CREATE POLICY fzt_company_read ON public.fatt_zero_touch_runs FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS fzt_admin ON public.fatt_zero_touch_runs;
CREATE POLICY fzt_admin ON public.fatt_zero_touch_runs FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS fzt_super_admin ON public.fatt_zero_touch_runs;
CREATE POLICY fzt_super_admin ON public.fatt_zero_touch_runs FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.fatt_zero_touch_runs IS
  'MP-FAT-02: state machine fatturazione zero-touch SAL→SDI→reminder con resume idempotente.';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_fzt_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_fzt_updated_at ON public.fatt_zero_touch_runs;
CREATE TRIGGER trg_fzt_updated_at
  BEFORE UPDATE ON public.fatt_zero_touch_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_fzt_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Estensione companies con feature flag
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS fatt_zero_touch_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fatt_zero_touch_hitl_threshold_eur numeric(12,2) NOT NULL DEFAULT 10000;

-- ────────────────────────────────────────────────────────────────────────────
-- Trigger SAL → fatt_zero_touch (defensive: solo se tabella sal esiste)
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'sal'
  ) THEN
    -- Crea trigger function
    CREATE OR REPLACE FUNCTION public.tg_fatt_zero_touch_on_sal()
    RETURNS TRIGGER LANGUAGE plpgsql AS $tr$
    DECLARE
      v_company_id uuid;
      v_customer_id uuid;
      v_enabled boolean;
    BEGIN
      IF NEW.status IS NOT DISTINCT FROM 'approvato'
         AND (OLD IS NULL OR OLD.status IS DISTINCT FROM NEW.status) THEN
        SELECT o.company_id, o.customer_id INTO v_company_id, v_customer_id
          FROM public.orders o
          WHERE o.id = NEW.order_id;

        SELECT fatt_zero_touch_enabled INTO v_enabled
          FROM public.companies WHERE id = v_company_id;

        IF v_enabled IS TRUE THEN
          INSERT INTO public.fatt_zero_touch_runs (
            company_id, trigger_source, trigger_data,
            sal_id, order_id, customer_id, status
          ) VALUES (
            v_company_id, 'sal_approved',
            jsonb_build_object('sal_id', NEW.id, 'sal_status', NEW.status),
            NEW.id, NEW.order_id, v_customer_id, 'pending'
          );
        END IF;
      END IF;
      RETURN NEW;
    END $tr$;

    -- Drop e ricrea trigger sulla tabella sal
    DROP TRIGGER IF EXISTS trg_fatt_zero_touch_on_sal ON public.sal;
    EXECUTE 'CREATE TRIGGER trg_fatt_zero_touch_on_sal
             AFTER INSERT OR UPDATE OF status ON public.sal
             FOR EACH ROW EXECUTE FUNCTION public.tg_fatt_zero_touch_on_sal()';
  ELSE
    RAISE NOTICE 'Tabella public.sal non esiste — trigger fatt_zero_touch_on_sal NON creato. Riapplicare la migration dopo l''aggiunta del modulo SAL.';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_verifica_anagrafica_fattura
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_verifica_anagrafica_fattura(
  p_company_id uuid,
  p_user_id uuid,
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer RECORD;
  v_missing text[] := ARRAY[]::text[];
  v_complete boolean := true;
BEGIN
  SELECT id, first_name, last_name, vat_number, codice_fiscale, email, phone,
         indirizzo, comune, provincia, cap, sdi_code, pec_email,
         is_pa, regime_fiscale
    INTO v_customer
    FROM public.profiles WHERE id = p_customer_id;

  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Cliente non trovato', 'complete', false);
  END IF;

  IF v_customer.vat_number IS NULL AND v_customer.codice_fiscale IS NULL THEN
    v_missing := array_append(v_missing, 'partita_iva o codice_fiscale');
    v_complete := false;
  END IF;
  IF v_customer.indirizzo IS NULL THEN
    v_missing := array_append(v_missing, 'indirizzo'); v_complete := false;
  END IF;
  IF v_customer.comune IS NULL THEN
    v_missing := array_append(v_missing, 'comune'); v_complete := false;
  END IF;
  IF v_customer.cap IS NULL THEN
    v_missing := array_append(v_missing, 'cap'); v_complete := false;
  END IF;
  IF v_customer.sdi_code IS NULL AND v_customer.pec_email IS NULL THEN
    v_missing := array_append(v_missing, 'sdi_code o pec_email');
    v_complete := false;
  END IF;

  RETURN jsonb_build_object(
    'customer_id', p_customer_id,
    'complete', v_complete,
    'missing_fields', to_jsonb(v_missing),
    'is_pa', COALESCE(v_customer.is_pa, false),
    'regime_fiscale', v_customer.regime_fiscale,
    'has_pec', v_customer.pec_email IS NOT NULL,
    'has_sdi', v_customer.sdi_code IS NOT NULL,
    'splitting_required', COALESCE(v_customer.is_pa, false)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_verifica_anagrafica_fattura(uuid, uuid, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_verifica_anagrafica_fattura(uuid, uuid, uuid)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_avanza_fatt_zero_touch (state machine step)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_avanza_fatt_zero_touch(
  p_company_id uuid,
  p_user_id uuid,
  p_run_id uuid,
  p_new_status text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run RECORD;
  v_step_entry jsonb;
BEGIN
  SELECT * INTO v_run FROM public.fatt_zero_touch_runs WHERE id = p_run_id;
  IF v_run IS NULL OR v_run.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Run non trovato');
  END IF;

  v_step_entry := jsonb_build_object(
    'from_status', v_run.status,
    'to_status', p_new_status,
    'at', NOW(),
    'metadata', p_metadata
  );

  UPDATE public.fatt_zero_touch_runs
     SET status = p_new_status,
         steps_log = COALESCE(steps_log, '[]'::jsonb) || jsonb_build_array(v_step_entry),
         updated_at = NOW(),
         completed_at = CASE WHEN p_new_status = 'completed' THEN NOW() ELSE completed_at END
   WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', p_run_id,
    'new_status', p_new_status
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_avanza_fatt_zero_touch(uuid, uuid, uuid, text, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_avanza_fatt_zero_touch(uuid, uuid, uuid, text, jsonb)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_lista_fatt_zero_touch_runs (per UI dashboard)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_fatt_zero_touch_runs(
  p_company_id uuid,
  p_user_id uuid,
  p_status_filter text DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_limit int := GREATEST(1, LEAST(200, p_limit));
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'runs', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'trigger_source', trigger_source,
        'status', status,
        'order_id', order_id,
        'invoice_id', invoice_id,
        'amount_total_eur', amount_total_eur,
        'hitl_required', hitl_required,
        'sdi_status', sdi_status,
        'created_at', created_at,
        'completed_at', completed_at
      ) ORDER BY created_at DESC
    ) FILTER (WHERE id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT * FROM public.fatt_zero_touch_runs
     WHERE company_id = p_company_id
       AND (p_status_filter IS NULL OR status = p_status_filter)
     ORDER BY created_at DESC
     LIMIT v_limit
  ) sub;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'runs', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_fatt_zero_touch_runs(uuid, uuid, text, int)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_fatt_zero_touch_runs(uuid, uuid, text, int)
  TO service_role;
