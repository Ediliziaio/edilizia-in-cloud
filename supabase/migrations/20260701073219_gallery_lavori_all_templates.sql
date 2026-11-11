-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Ordered 20271114000001 repeats this after every template module exists.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sr_template_pdf','tet_template_pdf','ele_template_pdf','bgn_template_pdf','fv_template_pdf','idr_template_pdf','pis_template_pdf','rst_template_pdf','pav_template_pdf','clm_template_pdf'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN
   EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS gallery_lavori jsonb',t);
  END IF;
 END LOOP;
END $$;
