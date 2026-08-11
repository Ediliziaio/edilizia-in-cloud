-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE sr_template_pdf  ADD COLUMN IF NOT EXISTS gallery_lavori jsonb;
ALTER TABLE tet_template_pdf ADD COLUMN IF NOT EXISTS gallery_lavori jsonb;
ALTER TABLE ele_template_pdf ADD COLUMN IF NOT EXISTS gallery_lavori jsonb;
ALTER TABLE bgn_template_pdf ADD COLUMN IF NOT EXISTS gallery_lavori jsonb;
ALTER TABLE fv_template_pdf  ADD COLUMN IF NOT EXISTS gallery_lavori jsonb;
ALTER TABLE idr_template_pdf ADD COLUMN IF NOT EXISTS gallery_lavori jsonb;
ALTER TABLE pis_template_pdf ADD COLUMN IF NOT EXISTS gallery_lavori jsonb;
ALTER TABLE rst_template_pdf ADD COLUMN IF NOT EXISTS gallery_lavori jsonb;
ALTER TABLE pav_template_pdf ADD COLUMN IF NOT EXISTS gallery_lavori jsonb;
ALTER TABLE clm_template_pdf ADD COLUMN IF NOT EXISTS gallery_lavori jsonb;
