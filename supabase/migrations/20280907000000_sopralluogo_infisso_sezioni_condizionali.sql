-- ============================================================================
-- Sopralluogo infissi: mostrare i complementi solo se ci sono davvero
-- ============================================================================
-- La scheda di UN infisso conta 37 campi, 18 obbligatori — e li chiede tutti
-- anche su una finestra fissa senza tapparella, senza persiana e senza
-- zanzariera. Su un appartamento da 12 serramenti fanno oltre 400 campi da
-- compilare in casa del cliente, col telefono in mano: è il motivo per cui
-- nessun sopralluogo è mai stato compilato (4 creati, tutti vuoti).
--
-- Il template ha già la domanda giusta — "Cosa rilevo (complementi presenti)",
-- campo `complementi`, multiselect — e il motore sa già valutare `show_if`
-- con l'operatore `contains`. Mancava solo di collegare le due cose.
--
-- Dopo: una finestra semplice mostra 12 campi e 6 obbligatori invece di 37 e
-- 18. Spuntando "Tapparella" compaiono i 5 campi della tapparella, e non prima.
-- ============================================================================

WITH mappa(etichetta, complemento) AS (
  VALUES
    ('Tapparella',       'tapparella'),
    ('Cassonetto',       'cassonetto'),
    ('Zanzariera',       'zanzariera'),
    ('Persiana / Scuro', 'persiana'),
    ('Davanzale',        'davanzale')
),
ricostruito AS (
  SELECT
    t.id,
    jsonb_set(
      t.schema,
      '{element_types}',
      (
        SELECT jsonb_agg(
                 CASE WHEN et->>'key' = 'infisso'
                      THEN jsonb_set(et, '{sections}', (
                             SELECT jsonb_agg(
                                      CASE WHEN m.complemento IS NOT NULL
                                           THEN s || jsonb_build_object(
                                                  'show_if', jsonb_build_object(
                                                    'field',    'complementi',
                                                    'operator', 'contains',
                                                    'value',    m.complemento
                                                  ))
                                           ELSE s
                                      END
                                      ORDER BY si
                                    )
                             FROM jsonb_array_elements(et->'sections') WITH ORDINALITY AS sez(s, si)
                             LEFT JOIN mappa m ON m.etichetta = sez.s->>'label'
                           ))
                      ELSE et
                 END
                 ORDER BY ei
               )
        FROM jsonb_array_elements(t.schema->'element_types') WITH ORDINALITY AS elem(et, ei)
      )
    ) AS schema_nuovo
  FROM public.survey_templates t
  WHERE t.name = 'Rilievo Infissi e Serramenti'
)
UPDATE public.survey_templates t
   SET schema = r.schema_nuovo,
       updated_at = now()
  FROM ricostruito r
 WHERE t.id = r.id;
