-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.silvio_outbound_messages
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts   int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_silvio_outbound_claimable
  ON public.silvio_outbound_messages (created_at)
  WHERE status = 'queued' AND claimed_at IS NULL;
