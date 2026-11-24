-- Un modello, due profondità: nei modelli di serie si segnano le parti «solo tecnico».
-- Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 2.
--
-- Il sopralluogo commerciale (misure di massima per l'offerta) non vede le sezioni e i campi con
-- `solo_tecnico: true` (lib/surveys/sezioniPerTipo.ts). Qui si segnano solo dove il modello ha
-- davvero parti da tecnico:
--   * Infissi, elemento «infisso»: sezioni Telaio ed Extra; campi spessore muro, mazzette,
--     diametro del cilindro del cassonetto, spessore del profilo della zanzariera.
--   * Bagno, elemento «impianti»: sezioni Impianto idraulico ed elettrico.
-- Gli altri modelli si regolano dall'editor (Impostazioni → Sopralluoghi). Tocca 2 righe di serie;
-- i rilievi già creati tengono la loro copia del modello e non cambiano.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function pg_temp.segna_solo_tecnico(
  schema jsonb, p_tipo text, p_sezioni text[], p_campi text[]
) returns jsonb language sql immutable as $f$
  select jsonb_set(schema, '{element_types}', coalesce((
    select jsonb_agg(
      case when et->>'key' <> p_tipo then et
      else jsonb_set(et, '{sections}', coalesce((
        select jsonb_agg(
          (case when s->>'key' = any(p_sezioni) then s || '{"solo_tecnico": true}' else s end)
          || jsonb_build_object('fields', coalesce((
               select jsonb_agg(case when f->>'key' = any(p_campi) then f || '{"solo_tecnico": true}' else f end order by fo)
                 from jsonb_array_elements(s->'fields') with ordinality as y(f, fo)), '[]'::jsonb))
          order by so)
          from jsonb_array_elements(et->'sections') with ordinality as x(s, so)), '[]'::jsonb))
      end order by eo)
      from jsonb_array_elements(schema->'element_types') with ordinality as z(et, eo)), '[]'::jsonb))
$f$;

update public.survey_templates
   set schema = pg_temp.segna_solo_tecnico(schema, 'infisso', array['telaio', 'extra'],
                  array['spessore_muro', 'mazzetta_sx', 'mazzetta_dx', 'cas_cilindro', 'zan_larghezza_telaio']),
       updated_at = now()
 where is_system and category = 'infissi' and schema->'element_types' @> '[{"key":"infisso"}]';

update public.survey_templates
   set schema = pg_temp.segna_solo_tecnico(schema, 'impianti', array['idrico', 'elettrico'], array[]::text[]),
       updated_at = now()
 where is_system and category = 'bagno' and schema->'element_types' @> '[{"key":"impianti"}]';
