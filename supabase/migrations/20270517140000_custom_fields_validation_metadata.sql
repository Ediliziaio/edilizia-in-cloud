-- ============================================================================
-- v8.6.46 — Custom Fields: estensione schema minimal (C5)
--
-- Aggiunge i 2 campi di metadata più richiesti per validazione + UX:
--   - is_required: il campo è obbligatorio nei form
--   - help_text: testo di aiuto mostrato sotto al campo
--
-- I campi più complessi (validation_regex, min_value, max_value,
-- default_value, placeholder, visible_roles, is_active) restano in
-- roadmap C5-extended.
--
-- Backward compatible: defaults non-distruttivi.
-- ============================================================================

ALTER TABLE public.marketing_custom_fields
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.marketing_custom_fields
  ADD COLUMN IF NOT EXISTS help_text TEXT;

-- ============================================================================
-- Frontend integration:
-- - CustomFieldsConfig.tsx: nuovi input "Obbligatorio" (checkbox) + "Testo
--   di aiuto" (textarea) nel dialog create/edit
-- - CustomFieldInput.tsx: prop `helpText` mostrata sotto al campo
-- - Validazione client-side sui form (ContactDialog, OpportunityDialog,
--   EntityCustomFieldsSection) — controllo is_required prima del submit
-- ============================================================================
