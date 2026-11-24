/**
 * Un modello, due profondità (piano sopralluoghi, lotto 2).
 *
 * Il sopralluogo commerciale vede il modello senza le sezioni e i campi segnati «solo tecnico»:
 * niente telaio, mazzette o impianti quando servono solo le misure per l'offerta. Il tecnico vede
 * tutto. Sono «solo tecnico» anche le sezioni aggiunte dal programma per l'abaco e le misure di
 * dettaglio (campi `rv_…`), che nel commerciale non servono.
 *
 * Si applica una volta, quando il rilievo si carica: completezza, PDF e righe del preventivo
 * leggono già lo schema ridotto.
 */
import type { FieldDefinition, FieldSection, TemplateSchema } from "@/types/surveys";

const soloTecnicoDiProgramma = (s: FieldSection) =>
  s.fields.length > 0 && s.fields.every((f) => f.key.startsWith("rv_"));

function sezioniCommerciali(sezioni: FieldSection[] | undefined): FieldSection[] {
  return (sezioni ?? [])
    .filter((s) => !s.solo_tecnico && !soloTecnicoDiProgramma(s))
    .map((s) => ({ ...s, fields: campiCommerciali(s.fields) }))
    .filter((s) => s.fields.length > 0);
}

function campiCommerciali(campi: FieldDefinition[]): FieldDefinition[] {
  return campi
    .filter((f) => !f.solo_tecnico && !f.key.startsWith("rv_"))
    .map((f) => (f.nested_fields ? { ...f, nested_fields: campiCommerciali(f.nested_fields) } : f));
}

export function schemaPerTipo<T extends TemplateSchema | null | undefined>(schema: T, tipo: string | null | undefined): T {
  if (!schema || tipo !== "commerciale") return schema;
  return {
    ...schema,
    header_schema: sezioniCommerciali(schema.header_schema),
    element_types: (schema.element_types ?? []).map((t) => ({ ...t, sections: sezioniCommerciali(t.sections) })),
  } as T;
}
