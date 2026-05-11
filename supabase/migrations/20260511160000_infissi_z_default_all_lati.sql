-- ═══════════════════════════════════════════════════════════════════════════
-- Patch Infissi: Z su tutti i 4 lati come default + label esplicativa
-- ---------------------------------------------------------------------------
-- Il default operativo è Z su TUTTI i lati. Il tecnico deve solo togliere
-- la Z dai lati dove NON è presente. Multiselect ora ha default_value con
-- tutti i 4 lati spuntati: l'engine FieldRenderer applica default quando
-- value è undefined (campo mai toccato).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.survey_templates
SET schema = jsonb_set(
  schema,
  '{element_types}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN et->>'key' = 'infisso' THEN
          jsonb_set(et, '{sections}', (
            SELECT jsonb_agg(
              CASE
                WHEN sec->>'key' = 'telaio' THEN
                  jsonb_set(sec, '{fields}', (
                    SELECT jsonb_agg(
                      CASE
                        WHEN f->>'key' = 'lati_con_z' THEN
                          f || jsonb_build_object(
                            'label', 'Lati con Z presente (di default tutti)',
                            'help', 'Standard: Z su tutti i 4 lati. Togli la spunta SOLO ai lati dove la Z non va applicata.',
                            'default_value', jsonb_build_array('alto', 'basso', 'dx', 'sx')
                          )
                        ELSE f
                      END
                    )
                    FROM jsonb_array_elements(sec->'fields') AS f
                  ))
                ELSE sec
              END
            )
            FROM jsonb_array_elements(et->'sections') AS sec
          ))
        ELSE et
      END
    )
    FROM jsonb_array_elements(schema->'element_types') AS et
  )
),
version = 5
WHERE category = 'infissi' AND is_system = true;

COMMIT;
