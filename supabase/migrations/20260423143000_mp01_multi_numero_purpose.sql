-- MP01 — Multi-numero WhatsApp + purpose routing
-- Aggiunge campi purpose/display_name/budget + wa_routing_errors
-- + FK wa_number_id su whatsapp_messages + indici di routing.
-- Owner: Florin Andriciuc | Data: 2026-04-23

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Estensione ai_whatsapp_numbers
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'bot_operativo'
    CHECK (purpose IN ('bot_operativo','assistenza','lead','marketing','notifiche'));

ALTER TABLE public.ai_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS display_name TEXT;

ALTER TABLE public.ai_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS daily_budget_eur NUMERIC(10,2) DEFAULT 10.00;

ALTER TABLE public.ai_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS current_day_spend_eur NUMERIC(10,2) DEFAULT 0.00;

ALTER TABLE public.ai_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS day_counter_reset_at DATE DEFAULT CURRENT_DATE;

ALTER TABLE public.ai_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Indici di routing (critici per performance webhook)
-- ───────────────────────────────────────────────────────────────────────────

-- 1 numero per scopo per azienda (solo attivi, soft-delete aware)
CREATE UNIQUE INDEX IF NOT EXISTS ux_wa_numbers_company_purpose_active
  ON public.ai_whatsapp_numbers (company_id, purpose)
  WHERE deleted_at IS NULL;

-- phone_number_id globalmente univoco (lookup webhook O(log N))
CREATE UNIQUE INDEX IF NOT EXISTS ux_wa_numbers_phone_id
  ON public.ai_whatsapp_numbers (phone_number_id)
  WHERE phone_number_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_wa_numbers_company
  ON public.ai_whatsapp_numbers (company_id)
  WHERE deleted_at IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Tabella errori di routing
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_routing_errors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts               TIMESTAMPTZ DEFAULT now(),
  error_kind       TEXT NOT NULL CHECK (error_kind IN (
    'unknown_phone_number_id',
    'hmac_invalid',
    'payload_malformed',
    'company_disabled',
    'purpose_not_configured',
    'agent_not_found',
    'rate_limit_exceeded'
  )),
  phone_number_id  TEXT,
  wa_message_id    TEXT,
  payload_excerpt  TEXT,
  error_detail     TEXT,
  resolved         BOOLEAN DEFAULT false,
  resolved_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_wa_routing_errors_ts
  ON public.wa_routing_errors(ts DESC);

CREATE INDEX IF NOT EXISTS ix_wa_routing_errors_unresolved
  ON public.wa_routing_errors(ts DESC) WHERE resolved = false;

-- RLS: solo super_admin può leggere/scrivere dalla dashboard.
-- Le edge function usano SERVICE_ROLE_KEY che bypassa RLS.
ALTER TABLE public.wa_routing_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_routing_errors_admin_all" ON public.wa_routing_errors;
CREATE POLICY "wa_routing_errors_admin_all" ON public.wa_routing_errors
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 4. FK whatsapp_messages.wa_number_id → ai_whatsapp_numbers.id
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS wa_number_id UUID
    REFERENCES public.ai_whatsapp_numbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_wa_messages_wa_number
  ON public.whatsapp_messages(wa_number_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Trigger updated_at su ai_whatsapp_numbers
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_wa_numbers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_numbers_updated_at ON public.ai_whatsapp_numbers;
CREATE TRIGGER trg_wa_numbers_updated_at
  BEFORE UPDATE ON public.ai_whatsapp_numbers
  FOR EACH ROW EXECUTE FUNCTION public.fn_wa_numbers_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Commento tabelle/colonne per self-documentation
-- ───────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.ai_whatsapp_numbers.purpose IS
  'MP01 — Scopo del numero: bot_operativo|assistenza|lead|marketing|notifiche. 1 per scopo per azienda (UNIQUE parziale).';

COMMENT ON COLUMN public.ai_whatsapp_numbers.daily_budget_eur IS
  'MP01 — Budget giornaliero € per questo numero. Quando current_day_spend_eur lo supera, invii outbound bloccati.';

COMMENT ON TABLE public.wa_routing_errors IS
  'MP01 — Log errori routing webhook Meta (phone_id ignoto, HMAC invalid, payload rotto). Consultabile da super_admin.';

COMMENT ON COLUMN public.whatsapp_messages.wa_number_id IS
  'MP01 — FK al numero (ai_whatsapp_numbers) su cui è arrivato/partito il messaggio. NULL = legacy pre-MP01.';

COMMIT;
