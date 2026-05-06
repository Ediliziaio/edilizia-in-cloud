-- MP-CHAN-01 — Telegram Bot Channel
-- ════════════════════════════════════════════════════════════════════════════
-- Aggiunge Telegram come canale AI riusando il registry centrale (silvioTools).
-- Telegram Bot API è gratuita, perfetta come canale incluso nei piani Plus+.
--
-- Schema:
--   • telegram_bot_configs    — 1 bot per company (multi-tenant)
--   • telegram_user_mappings  — link Telegram user → EiC user (verified flow)
--   • telegram_messages       — log inbound/outbound + ai metadata
--   • RPC telegram_generate_verification_code — porta utente al bot via /verify
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.telegram_bot_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Da BotFather (encrypted at-rest via storage Supabase Vault in prod)
  bot_token       text NOT NULL,
  bot_username    text NOT NULL,
  bot_id          bigint UNIQUE,

  -- Webhook
  webhook_url     text,
  webhook_secret  text NOT NULL,

  enabled         boolean NOT NULL DEFAULT true,

  -- Limiti uso
  max_messages_per_day int NOT NULL DEFAULT 1000,
  rate_limit_per_user_per_minute int NOT NULL DEFAULT 10,

  -- Default persona per chat 1:1 (di solito 'silvio')
  default_persona_key text NOT NULL DEFAULT 'silvio',

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_company_bot UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_tg_bot_configs_company
  ON public.telegram_bot_configs(company_id) WHERE enabled = true;

ALTER TABLE public.telegram_bot_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tg_config_admin ON public.telegram_bot_configs;
CREATE POLICY tg_config_admin ON public.telegram_bot_configs FOR ALL
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'company_admin'::public.app_role));

DROP POLICY IF EXISTS tg_config_super_admin ON public.telegram_bot_configs;
CREATE POLICY tg_config_super_admin ON public.telegram_bot_configs FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.telegram_user_mappings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_config_id   uuid NOT NULL REFERENCES public.telegram_bot_configs(id) ON DELETE CASCADE,

  -- Telegram side
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,

  -- EiC side
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Onboarding flow
  is_verified     boolean NOT NULL DEFAULT false,
  verification_code text,
  verification_expires_at timestamptz,
  verified_at     timestamptz,

  -- Stato corrente
  active_persona_key text NOT NULL DEFAULT 'silvio',
  active_session_id uuid,

  -- Metriche
  total_messages_sent     int NOT NULL DEFAULT 0,
  total_messages_received int NOT NULL DEFAULT 0,
  last_message_at         timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_bot_telegram_user UNIQUE (bot_config_id, telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_tg_mappings_user_id
  ON public.telegram_user_mappings(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tg_mappings_company
  ON public.telegram_user_mappings(company_id);
CREATE INDEX IF NOT EXISTS idx_tg_mappings_telegram
  ON public.telegram_user_mappings(telegram_user_id);

ALTER TABLE public.telegram_user_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tg_mappings_self ON public.telegram_user_mappings;
CREATE POLICY tg_mappings_self ON public.telegram_user_mappings FOR SELECT
  USING (user_id = auth.uid() OR company_id = public.get_my_company_id());

DROP POLICY IF EXISTS tg_mappings_admin ON public.telegram_user_mappings;
CREATE POLICY tg_mappings_admin ON public.telegram_user_mappings FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS tg_mappings_super_admin ON public.telegram_user_mappings;
CREATE POLICY tg_mappings_super_admin ON public.telegram_user_mappings FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.telegram_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_config_id   uuid NOT NULL REFERENCES public.telegram_bot_configs(id) ON DELETE CASCADE,
  mapping_id      uuid REFERENCES public.telegram_user_mappings(id) ON DELETE SET NULL,

  direction       text NOT NULL CHECK (direction IN ('inbound','outbound')),
  telegram_message_id bigint,

  message_type    text NOT NULL CHECK (message_type IN ('text','photo','voice','document','location','callback_query')),
  content         text,
  media_url       text,

  -- Per processo AI
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','processing','processed','error','skipped')),
  ai_session_id   uuid,
  ai_persona_key  text,
  ai_response     text,
  ai_tool_calls   jsonb,
  ai_cost_billed_eur numeric(10,4),

  error_message   text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tg_messages_mapping_date
  ON public.telegram_messages(mapping_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tg_messages_status
  ON public.telegram_messages(processing_status, created_at DESC)
  WHERE processing_status IN ('pending','processing','error');

ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tg_messages_company_read ON public.telegram_messages;
CREATE POLICY tg_messages_company_read ON public.telegram_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.telegram_bot_configs
       WHERE id = telegram_messages.bot_config_id
         AND company_id = public.get_my_company_id()
    )
  );

DROP POLICY IF EXISTS tg_messages_super_admin ON public.telegram_messages;
CREATE POLICY tg_messages_super_admin ON public.telegram_messages FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: telegram_generate_verification_code
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.telegram_generate_verification_code()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_bot_config RECORD;
  v_code text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '28000';
  END IF;

  v_company_id := public.get_my_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Nessuna azienda associata');
  END IF;

  SELECT id, bot_username, enabled INTO v_bot_config
    FROM public.telegram_bot_configs
   WHERE company_id = v_company_id AND enabled = true
   LIMIT 1;

  IF v_bot_config IS NULL THEN
    RETURN jsonb_build_object('error', 'Bot Telegram non configurato per questa azienda');
  END IF;

  -- Codice random 6 cifre
  v_code := lpad(floor(random() * 1000000)::text, 6, '0');

  -- Crea o aggiorna placeholder mapping (telegram_user_id=0 finché l'utente non
  -- avvia chat con bot e fa /verify <code>)
  INSERT INTO public.telegram_user_mappings (
    bot_config_id, telegram_user_id, user_id, company_id,
    verification_code, verification_expires_at, is_verified
  )
  VALUES (
    v_bot_config.id, 0, v_user_id, v_company_id,
    v_code, NOW() + INTERVAL '15 minutes', false
  )
  ON CONFLICT (bot_config_id, telegram_user_id) DO UPDATE
    SET verification_code = v_code,
        verification_expires_at = NOW() + INTERVAL '15 minutes',
        user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', v_code,
    'expires_at', NOW() + INTERVAL '15 minutes',
    'bot_username', v_bot_config.bot_username,
    'instructions', format('Apri Telegram, cerca @%s e invia: /verify %s', v_bot_config.bot_username, v_code)
  );
END $$;

REVOKE ALL ON FUNCTION public.telegram_generate_verification_code() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.telegram_generate_verification_code() TO authenticated;

COMMENT ON FUNCTION public.telegram_generate_verification_code IS
  'MP-CHAN-01: genera codice verifica 6 cifre TTL 15min per collegare account Telegram a EiC.';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_telegram_bot_configs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_telegram_bot_configs_updated_at ON public.telegram_bot_configs;
CREATE TRIGGER trg_telegram_bot_configs_updated_at
  BEFORE UPDATE ON public.telegram_bot_configs
  FOR EACH ROW EXECUTE FUNCTION public.tg_telegram_bot_configs_updated_at();
