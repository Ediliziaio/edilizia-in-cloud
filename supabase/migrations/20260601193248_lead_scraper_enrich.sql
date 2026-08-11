-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.lead_scraper_results
  ADD COLUMN IF NOT EXISTS partita_iva    text,
  ADD COLUMN IF NOT EXISTS facebook_url   text,
  ADD COLUMN IF NOT EXISTS instagram_url  text,
  ADD COLUMN IF NOT EXISTS intent_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_status   text,
  ADD COLUMN IF NOT EXISTS intent_score   smallint CHECK (intent_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS enrichment     jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_lss_results_intent
  ON public.lead_scraper_results(search_id, intent_score DESC NULLS LAST);
