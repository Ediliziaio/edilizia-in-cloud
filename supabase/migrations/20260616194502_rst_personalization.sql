-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.rst_template_pdf
  ADD COLUMN IF NOT EXISTS garanzie jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS faq jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS percorso jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS show_garanzie boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_percorso boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS cover_title_size numeric DEFAULT 30,
  ADD COLUMN IF NOT EXISTS cover_text_align text DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS default_iva_pct numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS default_detrazione_pct numeric DEFAULT 50,
  ADD COLUMN IF NOT EXISTS default_validita_giorni integer DEFAULT 30;
