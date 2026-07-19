-- WhatsApp Locale (OpenWA) — hardening: dedup, media inbound, non-letti, tetto settimanale.

-- ── Dedup: niente messaggi doppi dai retry del webhook ───────────────────────
-- provider_msg_id è l'id del messaggio lato OpenWA: unico per messaggio reale.
CREATE UNIQUE INDEX IF NOT EXISTS openwa_messages_provider_uidx
  ON public.openwa_messages (provider_msg_id)
  WHERE provider_msg_id IS NOT NULL;

-- ── Inbox: tracciamento "non letti" ──────────────────────────────────────────
ALTER TABLE public.openwa_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS openwa_messages_unread_idx
  ON public.openwa_messages (created_at DESC)
  WHERE direction = 'inbound' AND read_at IS NULL;

-- ── Anti-ban: tetto SETTIMANALE per numero (oltre al giornaliero) ─────────────
ALTER TABLE public.openwa_numbers
  ADD COLUMN IF NOT EXISTS weekly_cap        integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS weekly_sent       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_sent_week  text;  -- chiave ISO "YYYY-Www" per il reset

COMMENT ON COLUMN public.openwa_numbers.weekly_cap IS 'Tetto messaggi settimanale per numero (anti-ban, oltre al daily_cap).';

-- ── Storage: bucket privato per i media in arrivo ────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('openwa-media', 'openwa-media', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "openwa_media_super_read" ON storage.objects;
CREATE POLICY "openwa_media_super_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'openwa-media' AND public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "openwa_media_service_all" ON storage.objects;
CREATE POLICY "openwa_media_service_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'openwa-media')
  WITH CHECK (bucket_id = 'openwa-media');
