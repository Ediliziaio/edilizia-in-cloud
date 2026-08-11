-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.outreach_replies
  ADD COLUMN IF NOT EXISTS intent            text,
  ADD COLUMN IF NOT EXISTS intent_confidence numeric;

CREATE INDEX IF NOT EXISTS idx_outreach_replies_intent
  ON public.outreach_replies (company_id, intent, received_at DESC);
