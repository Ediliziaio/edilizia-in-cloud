-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- The ordered 20271101010000 repeats this flag after preview support exists.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_feature_flags' AND column_name='supports_preview') THEN
INSERT INTO public.platform_feature_flags
  (key, name, description, category, is_beta, default_value, plans_included, icon, sort_order, supports_preview)
VALUES
  ('simulatore', 'Simulatore Contratti',
   'Banco di simulazione contratti edili: margine, IVA (singola/mista con beni significativi), finanziamenti, cronoprogramma, provvigioni, incidenza costi; trasforma in preventivo/commessa.',
   'marketing', false, true, '{}', 'Calculator', 0, true)
ON CONFLICT (key) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  category         = EXCLUDED.category,
  is_beta          = EXCLUDED.is_beta,
  default_value    = EXCLUDED.default_value,
  supports_preview = EXCLUDED.supports_preview;

END IF; END $$;
