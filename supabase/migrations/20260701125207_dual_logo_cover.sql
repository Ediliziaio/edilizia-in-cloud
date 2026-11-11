-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Only existing templates are extended here; the ordered module migrations repeat these columns.
DO $$ BEGIN IF to_regclass('public.sr_template_pdf') IS NOT NULL THEN ALTER TABLE sr_template_pdf ADD COLUMN IF NOT EXISTS pdf_cover_logo_url TEXT; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.fv_template_pdf') IS NOT NULL THEN ALTER TABLE fv_template_pdf ADD COLUMN IF NOT EXISTS pdf_cover_logo_url TEXT; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.tet_template_pdf') IS NOT NULL THEN ALTER TABLE tet_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.bgn_template_pdf') IS NOT NULL THEN ALTER TABLE bgn_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.ele_template_pdf') IS NOT NULL THEN ALTER TABLE ele_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.idr_template_pdf') IS NOT NULL THEN ALTER TABLE idr_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.pis_template_pdf') IS NOT NULL THEN ALTER TABLE pis_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.rst_template_pdf') IS NOT NULL THEN ALTER TABLE rst_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.pav_template_pdf') IS NOT NULL THEN ALTER TABLE pav_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.clm_template_pdf') IS NOT NULL THEN ALTER TABLE clm_template_pdf ADD COLUMN IF NOT EXISTS cover_logo_url TEXT; END IF; END $$;
