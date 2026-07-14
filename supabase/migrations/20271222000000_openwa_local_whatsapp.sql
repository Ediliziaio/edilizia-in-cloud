-- WhatsApp Locale (OpenWA) — canale non-ufficiale multi-numero, SOLO piattaforma.
-- Completamente separato dal canale Meta ufficiale (ai_whatsapp_numbers / whatsapp-*).
-- Usato da superadmin + collaboratori per outreach/marketing. NON esposto alle aziende.
--
-- Modello: gateway OpenWA self-hosted (VPS) → 1 sessione = 1 numero reale.
-- Rotazione invii per tag + tetto giornaliero per numero (anti-ban).
-- Config gateway (base URL / api key / webhook secret) vive in platform_settings.

-- ── Trigger updated_at dedicato del modulo ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.openwa_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── openwa_numbers: registry numeri locali della piattaforma ─────────────────
CREATE TABLE IF NOT EXISTS public.openwa_numbers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       text NOT NULL,                       -- id sessione lato gateway OpenWA
  numero           text,                                -- E.164 rilevato dopo il pairing (es. +39333...)
  display_name     text,                                -- etichetta leggibile scelta dall'admin
  stato            text NOT NULL DEFAULT 'connecting',  -- connecting | connected | disconnected | banned
  tags             text[] NOT NULL DEFAULT '{}',        -- segmenti serviti da questo numero (match coi tag contatto)
  daily_cap        integer NOT NULL DEFAULT 10,         -- tetto messaggi/giorno per anti-spam
  daily_sent       integer NOT NULL DEFAULT 0,          -- inviati oggi (reset implicito quando cambia daily_sent_date)
  daily_sent_date  date,                                -- giorno del contatore daily_sent
  last_seen_at     timestamptz,                         -- ultimo heartbeat/attività dal gateway
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT openwa_numbers_stato_chk
    CHECK (stato IN ('connecting','connected','disconnected','banned')),
  CONSTRAINT openwa_numbers_daily_cap_chk CHECK (daily_cap >= 0)
);

-- session_id univoco tra i numeri non eliminati (si può riciclare dopo delete logico)
CREATE UNIQUE INDEX IF NOT EXISTS openwa_numbers_session_uidx
  ON public.openwa_numbers (session_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS openwa_numbers_stato_idx
  ON public.openwa_numbers (stato) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_openwa_numbers_updated ON public.openwa_numbers;
CREATE TRIGGER trg_openwa_numbers_updated BEFORE UPDATE ON public.openwa_numbers
  FOR EACH ROW EXECUTE FUNCTION public.openwa_set_updated_at();

-- ── openwa_messages: store messaggi del canale (inbound + outbound) ──────────
CREATE TABLE IF NOT EXISTS public.openwa_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number_id        uuid REFERENCES public.openwa_numbers(id) ON DELETE SET NULL,
  contact_id       uuid,                                -- marketing_contacts.id (platform company), nullable
  wa_chat_id       text NOT NULL,                       -- chat WhatsApp controparte (es. 39333...@c.us)
  contact_phone    text,                                -- E.164 controparte (comodo per l'inbox)
  contact_name     text,
  direction        text NOT NULL,                       -- inbound | outbound
  body             text,
  media_url        text,
  status           text NOT NULL DEFAULT 'sent',        -- queued | sent | delivered | read | failed
  provider_msg_id  text,                                -- id messaggio lato OpenWA
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT openwa_messages_direction_chk CHECK (direction IN ('inbound','outbound')),
  CONSTRAINT openwa_messages_status_chk
    CHECK (status IN ('queued','sent','delivered','read','failed'))
);

CREATE INDEX IF NOT EXISTS openwa_messages_chat_idx
  ON public.openwa_messages (wa_chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS openwa_messages_contact_idx
  ON public.openwa_messages (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS openwa_messages_number_idx
  ON public.openwa_messages (number_id, created_at DESC);

-- ── RLS: super_admin (console) + service_role (edge/webhook). No tenant. ─────
-- Stesso pattern del modulo outreach_* (migration 20270815000000).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['openwa_numbers','openwa_messages'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_super ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_super ON public.%1$s FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_service ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_service ON public.%1$s FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ── Realtime: l'inbox si aggiorna live sugli INSERT di openwa_messages ───────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'openwa_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.openwa_messages;
  END IF;
END $$;
