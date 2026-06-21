-- Registra la feature "simulatore" nel catalogo platform_feature_flags.
--
-- Il Simulatore Contratti (azienda → Marketing & Vendita) è gated da
-- FeatureRoute / useFeatureAccess, che è FAIL-CLOSED: una chiave non presente
-- nel catalogo resta DISABILITATA per tutte le aziende (solo i super-admin la
-- vedono in preview, grazie a supports_preview). Senza questa riga la sezione
-- è quindi invisibile in produzione.
--
-- default_value = true → abilitata per tutte le aziende (può essere ristretta
-- in seguito via plans_included o company_feature_overrides).
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
