-- Dual logo: logo sfondo chiaro (header/footer) + logo sfondo scuro (copertina).
-- Serramenti e Fotovoltaico usano il prefisso pdf_cover_*; gli altri usano cover_*.
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
