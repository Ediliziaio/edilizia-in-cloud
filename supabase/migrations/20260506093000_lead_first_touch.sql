-- MP-SALES-01 — Lead First-Touch < 60 secondi
-- ════════════════════════════════════════════════════════════════════════════
-- Pipeline AI agent autonomo che risponde al lead entro 60s su qualsiasi
-- canale (Meta/Google/TikTok ads, form sito, WhatsApp, missed call, email).
--
-- Defensive: tabella `leads` NON esiste → uso lead_first_touch_runs come
-- fonte primaria (lead_id opzionale FK + raw_payload completo).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.lead_first_touch_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- lead_id non FK rigida (tabella leads può non esistere su tutti i tenant)
  lead_id         uuid,

  -- Source tracking
  source_channel  text NOT NULL CHECK (source_channel IN (
    'meta_lead_ads','google_ads','tiktok_lead','linkedin',
    'website_form','whatsapp_inbound','telegram_inbound','missed_call','email_inbound','referral'
  )),
  source_campaign     text,
  source_creative_id  text,
  source_landing_url  text,

  -- Lead data
  contact_name    text,
  contact_phone   text,
  contact_email   text,
  contact_address text,
  vertical_interest text,
  raw_payload     jsonb,

  -- AI processing
  enrichment_data       jsonb,
  qualification_score   numeric(3,2),
  ai_persona_used       text NOT NULL DEFAULT 'sales',
  ai_cost_total_eur     numeric(10,4) NOT NULL DEFAULT 0,

  -- First touch
  first_touch_channel    text,
  first_touch_message    text,
  first_touch_sent_at    timestamptz,
  first_touch_latency_ms int,

  -- Engagement
  customer_responded     boolean NOT NULL DEFAULT false,
  customer_response_at   timestamptz,
  conversation_messages_count int NOT NULL DEFAULT 0,

  -- Outcome
  outcome         text CHECK (outcome IN (
    'qualified_appointment_booked','qualified_passed_to_human',
    'unqualified','no_response','spam','duplicate'
  )),
  appointment_at      timestamptz,
  passed_to_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- SLA tracking automatico
  sla_target_seconds int NOT NULL DEFAULT 60,
  sla_met         boolean GENERATED ALWAYS AS
    (first_touch_latency_ms IS NOT NULL AND first_touch_latency_ms <= sla_target_seconds * 1000)
    STORED,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lft_company_outcome
  ON public.lead_first_touch_runs(company_id, outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lft_sla
  ON public.lead_first_touch_runs(company_id, sla_met, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lft_pending_first_touch
  ON public.lead_first_touch_runs(created_at)
  WHERE first_touch_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lft_source
  ON public.lead_first_touch_runs(source_channel, created_at DESC);

ALTER TABLE public.lead_first_touch_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lft_company_read ON public.lead_first_touch_runs;
CREATE POLICY lft_company_read ON public.lead_first_touch_runs FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS lft_admin ON public.lead_first_touch_runs;
CREATE POLICY lft_admin ON public.lead_first_touch_runs FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS lft_super_admin ON public.lead_first_touch_runs;
CREATE POLICY lft_super_admin ON public.lead_first_touch_runs FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_lft_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_lft_updated_at ON public.lead_first_touch_runs;
CREATE TRIGGER trg_lft_updated_at
  BEFORE UPDATE ON public.lead_first_touch_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_lft_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_crea_lead_first_touch (idempotente, deduplica per email/phone+source)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_crea_lead_first_touch(
  p_company_id uuid,
  p_user_id uuid,
  p_source_channel text,
  p_contact_name text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_address text DEFAULT NULL,
  p_vertical_interest text DEFAULT NULL,
  p_source_campaign text DEFAULT NULL,
  p_source_landing_url text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_existing_id uuid;
BEGIN
  -- Dedupe: stesso (company, source, phone OR email) entro ultima ora → riusa
  IF p_contact_phone IS NOT NULL OR p_contact_email IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM public.lead_first_touch_runs
     WHERE company_id = p_company_id
       AND source_channel = p_source_channel
       AND created_at >= NOW() - INTERVAL '1 hour'
       AND (
         (p_contact_phone IS NOT NULL AND contact_phone = p_contact_phone) OR
         (p_contact_email IS NOT NULL AND contact_email = p_contact_email)
       )
     ORDER BY created_at DESC LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'duplicate', true,
        'run_id', v_existing_id,
        'message', 'Lead duplicato (stesso contatto + source entro 1h)'
      );
    END IF;
  END IF;

  INSERT INTO public.lead_first_touch_runs (
    company_id, source_channel, contact_name, contact_phone, contact_email,
    contact_address, vertical_interest, source_campaign, source_landing_url, raw_payload
  ) VALUES (
    p_company_id, p_source_channel, p_contact_name, p_contact_phone, p_contact_email,
    p_contact_address, p_vertical_interest, p_source_campaign, p_source_landing_url, p_raw_payload
  )
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'message', format('Lead %s acquisito da %s. AI agent prenderà contatto entro 60s.',
      COALESCE(p_contact_name, 'sconosciuto'), p_source_channel)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_crea_lead_first_touch(uuid, uuid, text, text, text, text, text, text, text, text, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_crea_lead_first_touch(uuid, uuid, text, text, text, text, text, text, text, text, jsonb)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_log_first_touch_sent (chiamata da edge dopo invio)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_log_first_touch_sent(
  p_run_id uuid,
  p_company_id uuid,
  p_channel text,
  p_message text,
  p_latency_ms int,
  p_ai_cost_eur numeric DEFAULT NULL,
  p_qualification_score numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lead_first_touch_runs
     SET first_touch_channel = p_channel,
         first_touch_message = p_message,
         first_touch_sent_at = NOW(),
         first_touch_latency_ms = p_latency_ms,
         ai_cost_total_eur = COALESCE(ai_cost_total_eur, 0) + COALESCE(p_ai_cost_eur, 0),
         qualification_score = COALESCE(p_qualification_score, qualification_score),
         updated_at = NOW()
   WHERE id = p_run_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Run non trovato');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', p_run_id,
    'sla_met', p_latency_ms <= 60000
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_log_first_touch_sent(uuid, uuid, text, text, int, numeric, numeric)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_log_first_touch_sent(uuid, uuid, text, text, int, numeric, numeric)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_lista_lead_first_touch (dashboard + KPI)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_lead_first_touch(
  p_company_id uuid,
  p_user_id uuid,
  p_days_back int DEFAULT 30,
  p_outcome_filter text DEFAULT NULL
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
    'count_sla_met', COUNT(*) FILTER (WHERE sla_met = true),
    'count_appointments', COUNT(*) FILTER (WHERE outcome = 'qualified_appointment_booked'),
    'count_passed_human', COUNT(*) FILTER (WHERE outcome = 'qualified_passed_to_human'),
    'avg_latency_ms', ROUND(AVG(first_touch_latency_ms)::numeric, 0),
    'leads', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'source_channel', source_channel,
        'contact_name', contact_name,
        'contact_phone', contact_phone,
        'contact_email', contact_email,
        'vertical_interest', vertical_interest,
        'first_touch_channel', first_touch_channel,
        'first_touch_latency_ms', first_touch_latency_ms,
        'sla_met', sla_met,
        'outcome', outcome,
        'qualification_score', qualification_score,
        'created_at', created_at
      ) ORDER BY created_at DESC
    ) FILTER (WHERE id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT * FROM public.lead_first_touch_runs
     WHERE company_id = p_company_id
       AND created_at >= NOW() - (GREATEST(1, LEAST(180, p_days_back)) || ' days')::interval
       AND (p_outcome_filter IS NULL OR outcome = p_outcome_filter)
     ORDER BY created_at DESC
     LIMIT 200
  ) sub;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'leads', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_lead_first_touch(uuid, uuid, int, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_lead_first_touch(uuid, uuid, int, text)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_chiudi_lead_first_touch (outcome finale + assegnazione umana)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_chiudi_lead_first_touch(
  p_run_id uuid,
  p_company_id uuid,
  p_outcome text,
  p_appointment_at timestamptz DEFAULT NULL,
  p_passed_to_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lead_first_touch_runs
     SET outcome = p_outcome,
         appointment_at = COALESCE(p_appointment_at, appointment_at),
         passed_to_user_id = COALESCE(p_passed_to_user_id, passed_to_user_id),
         updated_at = NOW()
   WHERE id = p_run_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Run non trovato');
  END IF;

  RETURN jsonb_build_object('success', true, 'outcome', p_outcome);
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_chiudi_lead_first_touch(uuid, uuid, text, timestamptz, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_chiudi_lead_first_touch(uuid, uuid, text, timestamptz, uuid)
  TO service_role;
