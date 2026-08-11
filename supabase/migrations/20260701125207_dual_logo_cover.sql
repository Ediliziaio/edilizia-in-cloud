-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE sr_template_pdf ADD COLUMN IF NOT EXISTS pdf_cover_logo_url TEXT;
ALTER TABLE fv_template_pdf ADD COLUMN IF NOT EXISTS pdf_cover_logo_url TEXT;
ALTER TABLE tet_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT;
ALTER TABLE bgn_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT;
ALTER TABLE ele_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT;
ALTER TABLE idr_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT;
ALTER TABLE pis_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT;
ALTER TABLE rst_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT;
ALTER TABLE pav_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT;
ALTER TABLE clm_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT;
