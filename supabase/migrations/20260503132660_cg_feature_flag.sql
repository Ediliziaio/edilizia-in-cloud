-- MP-CG-01 — Feature flag `controllo_gestione_v1` (default OFF, ADD-ON)
-- L'intero modulo CG vive sotto questo flag. Attivazione esplicita per company.

INSERT INTO public.platform_feature_flags (
  key, name, description, category, is_beta, default_value, plans_included,
  price_per_month, icon, sort_order
) VALUES (
  'controllo_gestione_v1',
  'Controllo di Gestione',
  'Modulo add-on: CE riclassificato, Stato Patrimoniale + Rating bancario, Piano Industriale 3/5/7 anni, Pacchetto banca PDF. Default OFF, attivazione esplicita per singola azienda.',
  'finanza',
  true,
  false,
  ARRAY[]::text[],   -- nessun piano lo include automaticamente
  0,                 -- prezzo gestito a margine (vendita custom)
  'TrendingUp',
  500
)
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_beta = EXCLUDED.is_beta,
      default_value = EXCLUDED.default_value,
      icon = EXCLUDED.icon,
      sort_order = EXCLUDED.sort_order;

-- Sblocco esplicito per Demo Azienda S.r.l.
-- (company_id `778a2c76-1253-49f2-a5e8-283363ac3e29`).
-- L'azienda demo ha così visibilità sul modulo per QA / dimostrazione.
INSERT INTO public.company_feature_overrides (
  company_id, feature_key, is_enabled, override_reason, set_by_email
)
SELECT
  '778a2c76-1253-49f2-a5e8-283363ac3e29',
  'controllo_gestione_v1',
  true,
  'Sblocco demo per anteprima modulo Controllo di Gestione (MP-CG-01..08)',
  'system@ediliziaincloud.it'
WHERE EXISTS (
  SELECT 1
  FROM public.companies
  WHERE id = '778a2c76-1253-49f2-a5e8-283363ac3e29'
)
ON CONFLICT (company_id, feature_key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled,
      override_reason = EXCLUDED.override_reason,
      updated_at = now();
