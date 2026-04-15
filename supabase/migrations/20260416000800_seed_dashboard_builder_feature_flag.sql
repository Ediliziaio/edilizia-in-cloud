-- ════════════════════════════════════════════════════════════════
-- Sprint 2.1 — Seed feature flag 'dashboard_builder_v1'
-- nel sistema esistente platform_feature_flags
-- ════════════════════════════════════════════════════════════════
-- La tabella company_features creata nel Sprint 1 resta (backup + per
-- eventuali flag granulari futuri) ma non viene usata dal frontend.
-- Il frontend usa useFeatureFlags() che legge platform_feature_flags
-- + company_feature_overrides.
-- ════════════════════════════════════════════════════════════════

INSERT INTO public.platform_feature_flags (
  key, name, description, category, is_beta, default_value,
  plans_included, icon, sort_order
) VALUES (
  'dashboard_builder_v1',
  'Dashboard Builder',
  'Dashboard personalizzate con widget drag&drop, metriche configurabili e versioning. In beta.',
  'analytics',
  true,
  false,
  ARRAY[]::text[],
  'layout-dashboard',
  100
) ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  is_beta     = EXCLUDED.is_beta,
  icon        = EXCLUDED.icon;
