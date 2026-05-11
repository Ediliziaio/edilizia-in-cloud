-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint S6 — Miglioramenti template sopralluoghi
-- ---------------------------------------------------------------------------
-- - M10: snapshot schema su surveys (immutabilità storica)
-- - M2/M3/M4: 3 nuovi template sistema (Cappotto, Tetto, Climatizzazione)
-- - Bonus fiscale rimosso ovunque presente (Infissi header)
--
-- Modifiche surgical ai template esistenti (B5/B6/C3/C4/C6/C7/B7) sono
-- ora demandate all'editor visuale (l'utente clicca "Clona" → "Modifica"
-- e personalizza) per evitare migration fragili su JSONB esistente.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- M10: snapshot schema al momento della creazione del sopralluogo
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS template_schema_snapshot JSONB;

CREATE OR REPLACE FUNCTION public.fn_surveys_snapshot_template_schema()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.template_schema_snapshot IS NULL THEN
    SELECT schema INTO NEW.template_schema_snapshot
    FROM public.survey_templates WHERE id = NEW.template_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS surveys_snapshot_template_schema ON public.surveys;
CREATE TRIGGER surveys_snapshot_template_schema
  BEFORE INSERT ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.fn_surveys_snapshot_template_schema();

-- Backfill survey esistenti
UPDATE public.surveys s
SET template_schema_snapshot = t.schema
FROM public.survey_templates t
WHERE s.template_id = t.id
  AND s.template_schema_snapshot IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- Rimozione bonus_fiscale dal header (Infissi è l'unico che ce l'ha)
-- Approccio sicuro: aggiorna SOLO se il template ha effettivamente il campo
-- ───────────────────────────────────────────────────────────────────────────

DO $cleanup$
DECLARE
  v_id UUID;
  v_schema JSONB;
  v_new_header JSONB;
BEGIN
  FOR v_id, v_schema IN
    SELECT id, schema FROM public.survey_templates
    WHERE is_system = true
      AND schema IS NOT NULL
      AND schema::text LIKE '%bonus_fiscale%'
  LOOP
    -- Ricostruisce header_schema senza campi bonus_fiscale
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN sec ? 'fields' THEN
          jsonb_set(sec, '{fields}', COALESCE((
            SELECT jsonb_agg(f)
            FROM jsonb_array_elements(sec->'fields') AS f
            WHERE COALESCE(f->>'key', '') NOT IN ('bonus_fiscale', 'cessione_credito', 'cf_intestatario_bonus')
          ), '[]'::jsonb))
        ELSE sec
      END
    ), '[]'::jsonb)
    INTO v_new_header
    FROM jsonb_array_elements(v_schema->'header_schema') AS sec;

    IF v_new_header IS NOT NULL THEN
      UPDATE public.survey_templates
      SET schema = jsonb_set(v_schema, '{header_schema}', v_new_header)
      WHERE id = v_id;
    END IF;
  END LOOP;
END;
$cleanup$;

COMMIT;
