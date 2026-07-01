-- Gallery "I nostri lavori" su tutti i template PDF verticali.
-- Ogni voce: { id, url, didascalia?, luogo? }
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
