-- MP-FAT-01 v2 — Dunning Intelligente Fatture Cliente
-- ════════════════════════════════════════════════════════════════════════════
-- Sistema di sollecito adattivo guidato da persona AI 'amministrazione'.
-- Schema:
--   • dunning_policies   — config per company (aggressività, soglie, canali)
--   • dunning_actions    — sequence eventi per invoice (storia + outcome)
--   • RPC 5 nuovi tool   — analizza_storico, genera_messaggio, invia, pianifica, escala_legale
--   • Cron daily         — process-invoice-dunning-daily (lasciato a edge function)
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) dunning_policies — config per company
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dunning_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  default_aggressiveness text NOT NULL DEFAULT 'standard'
    CHECK (default_aggressiveness IN ('gentile','standard','fermo','aggressivo')),

  -- Soglie escalation
  threshold_high_value_eur numeric NOT NULL DEFAULT 10000,
  threshold_pa_eur         numeric NOT NULL DEFAULT 0,

  -- Preferenze canale per step (JSON: {step_1: ['email'], step_2: ['email','whatsapp'], ...})
  preferred_channels jsonb NOT NULL DEFAULT '{
    "step_1": ["email"],
    "step_2": ["email","whatsapp"],
    "step_3": ["email","whatsapp","voice"],
    "step_4": ["email","letter_legal"]
  }'::jsonb,

  -- Tempistiche custom (giorni dopo scadenza)
  step_days int[] NOT NULL DEFAULT ARRAY[0, 7, 15, 30, 45],

  -- Toggle features
  enable_auto_voice_call boolean NOT NULL DEFAULT false,
  enable_legal_letter    boolean NOT NULL DEFAULT false,

  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_company_dunning_policy UNIQUE (company_id)
);

ALTER TABLE public.dunning_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dunning_policies_company ON public.dunning_policies;
CREATE POLICY dunning_policies_company ON public.dunning_policies FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS dunning_policies_admin ON public.dunning_policies;
CREATE POLICY dunning_policies_admin ON public.dunning_policies FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS dunning_policies_super_admin ON public.dunning_policies;
CREATE POLICY dunning_policies_super_admin ON public.dunning_policies FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_dunning_policies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_dunning_policies_updated_at ON public.dunning_policies;
CREATE TRIGGER trg_dunning_policies_updated_at
  BEFORE UPDATE ON public.dunning_policies
  FOR EACH ROW EXECUTE FUNCTION public.tg_dunning_policies_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 2) dunning_actions — sequence eventi per invoice
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dunning_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id      uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  customer_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  step_n          int NOT NULL,
  scheduled_at    timestamptz NOT NULL,
  executed_at     timestamptz,

  -- Tono adattato dall'AI in base al cliente
  ai_tone         text CHECK (ai_tone IN ('gentile','formale','fermo','urgente','finale')),
  ai_message      text,
  ai_persona_used text NOT NULL DEFAULT 'amministrazione',
  ai_cost_billed_eur numeric(10,4),

  channel         text NOT NULL CHECK (channel IN ('email','whatsapp','voice','sms','letter_legal','manual')),

  -- Esito
  outcome         text CHECK (outcome IN ('sent','delivered','opened','clicked','responded','paid','no_response','failed','dispute')),
  customer_response text,
  paid_at         timestamptz,

  -- Threading
  next_action_id  uuid REFERENCES public.dunning_actions(id) ON DELETE SET NULL,
  parent_action_id uuid REFERENCES public.dunning_actions(id) ON DELETE SET NULL,

  -- Metadata
  external_message_id text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dunning_company_invoice
  ON public.dunning_actions(company_id, invoice_id, step_n);
CREATE INDEX IF NOT EXISTS idx_dunning_scheduled_pending
  ON public.dunning_actions(scheduled_at) WHERE executed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dunning_company_recent
  ON public.dunning_actions(company_id, created_at DESC);

ALTER TABLE public.dunning_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dunning_actions_company ON public.dunning_actions;
CREATE POLICY dunning_actions_company ON public.dunning_actions FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS dunning_actions_admin ON public.dunning_actions;
CREATE POLICY dunning_actions_admin ON public.dunning_actions FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS dunning_actions_super_admin ON public.dunning_actions;
CREATE POLICY dunning_actions_super_admin ON public.dunning_actions FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.dunning_actions IS
  'MP-FAT-01 v2: storia eventi dunning per invoice con tono AI + canale + outcome.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RPC: silvio_tool_storico_pagamenti (analizza cliente)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_storico_pagamenti(
  p_company_id uuid,
  p_user_id uuid,
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_total_invoices int;
  v_paid_count int;
  v_overdue_count int;
  v_avg_dso numeric;
  v_total_amount numeric;
  v_total_paid numeric;
  v_punctuality text;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'paid'),
    COUNT(*) FILTER (WHERE status IN ('overdue','unpaid') AND due_date < CURRENT_DATE),
    AVG(EXTRACT(EPOCH FROM (paid_at - due_date)) / 86400.0) FILTER (WHERE paid_at IS NOT NULL AND due_date IS NOT NULL),
    SUM(amount_total),
    SUM(amount_total) FILTER (WHERE status = 'paid')
  INTO v_total_invoices, v_paid_count, v_overdue_count, v_avg_dso, v_total_amount, v_total_paid
  FROM public.invoices
  WHERE company_id = p_company_id
    AND customer_id = p_customer_id;

  -- Score punctuality
  v_punctuality := CASE
    WHEN v_total_invoices = 0 THEN 'sconosciuto'
    WHEN v_avg_dso IS NULL OR v_avg_dso <= 0 THEN 'puntuale'
    WHEN v_avg_dso <= 7 THEN 'puntuale'
    WHEN v_avg_dso <= 30 THEN 'ritardatario_lieve'
    WHEN v_avg_dso <= 60 THEN 'ritardatario_serio'
    ELSE 'cliente_problema'
  END;

  v_result := jsonb_build_object(
    'customer_id', p_customer_id,
    'total_invoices', v_total_invoices,
    'paid_count', v_paid_count,
    'overdue_count', v_overdue_count,
    'avg_dso_days', ROUND(COALESCE(v_avg_dso, 0)::numeric, 1),
    'total_amount_eur', COALESCE(v_total_amount, 0),
    'total_paid_eur', COALESCE(v_total_paid, 0),
    'punctuality_score', v_punctuality,
    'recommended_tone', CASE v_punctuality
      WHEN 'puntuale' THEN 'gentile'
      WHEN 'ritardatario_lieve' THEN 'standard'
      WHEN 'ritardatario_serio' THEN 'fermo'
      WHEN 'cliente_problema' THEN 'urgente'
      ELSE 'standard'
    END
  );

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_storico_pagamenti(uuid, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_storico_pagamenti(uuid, uuid, uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RPC: silvio_tool_pianifica_dunning_step
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_pianifica_dunning_step(
  p_company_id uuid,
  p_user_id uuid,
  p_invoice_id uuid,
  p_step_n int,
  p_scheduled_at timestamptz,
  p_channel text DEFAULT 'email',
  p_ai_tone text DEFAULT 'standard',
  p_ai_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_action_id uuid;
BEGIN
  SELECT id, customer_id, company_id, amount_total, due_date, status
    INTO v_invoice
    FROM public.invoices WHERE id = p_invoice_id;

  IF v_invoice IS NULL OR v_invoice.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Fattura non trovata');
  END IF;

  INSERT INTO public.dunning_actions (
    company_id, invoice_id, customer_id, step_n, scheduled_at,
    ai_tone, ai_message, channel
  ) VALUES (
    p_company_id, p_invoice_id, v_invoice.customer_id, p_step_n, p_scheduled_at,
    p_ai_tone, p_ai_message, p_channel
  )
  RETURNING id INTO v_action_id;

  RETURN jsonb_build_object(
    'success', true,
    'action_id', v_action_id,
    'step_n', p_step_n,
    'scheduled_at', p_scheduled_at,
    'message', format('Step dunning #%s pianificato per %s via %s', p_step_n, p_scheduled_at, p_channel)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_pianifica_dunning_step(uuid, uuid, uuid, int, timestamptz, text, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_pianifica_dunning_step(uuid, uuid, uuid, int, timestamptz, text, text, text)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Seed dunning_policies default per ogni company esistente
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.dunning_policies (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;
