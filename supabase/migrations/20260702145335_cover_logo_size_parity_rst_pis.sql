-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.rst_template_pdf ADD COLUMN IF NOT EXISTS pdf_cover_logo_size integer;
ALTER TABLE public.pis_template_pdf ADD COLUMN IF NOT EXISTS pdf_cover_logo_size integer;
