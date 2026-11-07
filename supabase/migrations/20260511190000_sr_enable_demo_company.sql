-- ═══════════════════════════════════════════════════════════════════════════
-- Modulo Serramenti — Attivazione per Demo Azienda S.r.l.
-- ---------------------------------------------------------------------------
-- Override `modulo_serramenti_attivo` per la company demo.
-- Idempotente (ON CONFLICT DO UPDATE).
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.company_feature_overrides (
  company_id, feature_key, is_enabled, override_reason, notes
) SELECT
  c.id,
  'modulo_serramenti_attivo',
  true,
  'Modulo Serramenti attivato per demo (Wave 3 completata)',
  'Wizard 8 step funzionante con BOM serramenti+accessori, ROI 10 anni, Ecobonus 50/65%, cashflow, cronoprogramma. PDF generazione attiva con Wave 4.'
FROM public.companies c
WHERE c.id='778a2c76-1253-49f2-a5e8-283363ac3e29'::uuid
ON CONFLICT (company_id, feature_key)
DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  override_reason = EXCLUDED.override_reason,
  notes = EXCLUDED.notes,
  updated_at = now();
