-- ═══════════════════════════════════════════════════════════════════════════
-- Patch Infissi v6: Foto NON obbligatorie + sezione "Colori"
-- ---------------------------------------------------------------------------
-- 1) Tutte le foto richieste passano a required:false (caricabili ma non
--    bloccanti) — il tecnico può chiudere/salvare senza scattarle.
-- 2) La sezione header "🎨 Colori e finiture (uguali per tutti i pezzi)"
--    diventa semplicemente "Colori" (più pulita, meno verbosa).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

WITH tmpl AS (
  SELECT id, schema FROM public.survey_templates
  WHERE category = 'infissi' AND is_system = true
  LIMIT 1
),
-- 1. general_required_photos: required → false
step1 AS (
  SELECT id,
    CASE
      WHEN schema ? 'general_required_photos'
       AND jsonb_typeof(schema->'general_required_photos') = 'array' THEN
        jsonb_set(schema, '{general_required_photos}', (
          SELECT COALESCE(jsonb_agg(p || jsonb_build_object('required', false)), '[]'::jsonb)
          FROM jsonb_array_elements(schema->'general_required_photos') AS p
        ))
      ELSE schema
    END AS schema
  FROM tmpl
),
-- 2. area_definition.required_photos: required → false
step2 AS (
  SELECT id,
    CASE
      WHEN schema->'area_definition' ? 'required_photos'
       AND jsonb_typeof(schema->'area_definition'->'required_photos') = 'array' THEN
        jsonb_set(schema, '{area_definition,required_photos}', (
          SELECT COALESCE(jsonb_agg(p || jsonb_build_object('required', false)), '[]'::jsonb)
          FROM jsonb_array_elements(schema->'area_definition'->'required_photos') AS p
        ))
      ELSE schema
    END AS schema
  FROM step1
),
-- 3. element_types[*].required_photos: required → false (per ciascun element_type)
step3 AS (
  SELECT id,
    CASE
      WHEN schema ? 'element_types'
       AND jsonb_typeof(schema->'element_types') = 'array' THEN
        jsonb_set(schema, '{element_types}', (
          SELECT COALESCE(jsonb_agg(
            CASE
              WHEN et ? 'required_photos'
               AND jsonb_typeof(et->'required_photos') = 'array' THEN
                jsonb_set(et, '{required_photos}', (
                  SELECT COALESCE(jsonb_agg(p || jsonb_build_object('required', false)), '[]'::jsonb)
                  FROM jsonb_array_elements(et->'required_photos') AS p
                ))
              ELSE et
            END
          ), '[]'::jsonb)
          FROM jsonb_array_elements(schema->'element_types') AS et
        ))
      ELSE schema
    END AS schema
  FROM step2
),
-- 4. header_schema → sezione "colori_globali" label → "Colori"
step4 AS (
  SELECT id,
    CASE
      WHEN schema ? 'header_schema'
       AND jsonb_typeof(schema->'header_schema') = 'array' THEN
        jsonb_set(schema, '{header_schema}', (
          SELECT COALESCE(jsonb_agg(
            CASE
              WHEN sec->>'key' = 'colori_globali' THEN
                sec
                  || jsonb_build_object('label', 'Colori')
                  || jsonb_build_object('description', 'Compila qui i colori UNA VOLTA: vengono applicati a tutti i pezzi del sopralluogo. Se per qualche pezzo serve un colore diverso, segnalalo nelle note di quel pezzo.')
              ELSE sec
            END
          ), '[]'::jsonb)
          FROM jsonb_array_elements(schema->'header_schema') AS sec
        ))
      ELSE schema
    END AS schema
  FROM step3
)
UPDATE public.survey_templates t
SET schema = s.schema,
    version = 6
FROM step4 s
WHERE t.id = s.id
  AND s.schema IS NOT NULL;  -- guardia: mai NULL

COMMIT;
