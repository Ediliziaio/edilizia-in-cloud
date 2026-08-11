-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.rst_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.tet_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.bgn_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.clm_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.ele_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.idr_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.pav_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.pis_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
