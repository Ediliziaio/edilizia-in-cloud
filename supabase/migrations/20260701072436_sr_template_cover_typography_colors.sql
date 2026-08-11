-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow_color text,
  ADD COLUMN IF NOT EXISTS pdf_cover_title_color   text,
  ADD COLUMN IF NOT EXISTS pdf_cover_subtitle_color text;
