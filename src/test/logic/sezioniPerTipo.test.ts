import { describe, expect, it } from "vitest";
import { schemaPerTipo } from "@/lib/surveys/sezioniPerTipo";
import type { TemplateSchema } from "@/types/surveys";

const schema = {
  version: 1, general_required_photos: [], area_definition: { label: "A", label_plural: "A", fields: [] },
  header_schema: [{ key: "h", label: "H", fields: [{ key: "piano", label: "Piano", type: "text" }, { key: "accesso", label: "Accesso", type: "text", solo_tecnico: true }] }],
  element_types: [{ key: "infisso", label: "Infisso", label_plural: "Infissi", required_photos: [], sections: [
    { key: "dati", label: "Dati", fields: [{ key: "larghezza_foro", label: "L", type: "dimension", required: true }, { key: "mazzetta_sx", label: "M", type: "dimension", solo_tecnico: true }] },
    { key: "telaio", label: "Telaio", solo_tecnico: true, fields: [{ key: "tipo_telaio", label: "T", type: "select", required: true }] },
    { key: "abaco", label: "Abaco", fields: [{ key: "rv_abaco_swing", label: "Verso", type: "text" }] },
  ] }],
} as unknown as TemplateSchema;

describe("un modello, due profondità", () => {
  it("il commerciale non vede sezioni e campi «solo tecnico» né le sezioni rv_ del programma", () => {
    const c = schemaPerTipo(schema, "commerciale");
    expect(c.element_types[0].sections.map((s) => s.key)).toEqual(["dati"]);
    expect(c.element_types[0].sections[0].fields.map((f) => f.key)).toEqual(["larghezza_foro"]);
    expect(c.header_schema[0].fields.map((f) => f.key)).toEqual(["piano"]);
  });
  it("il tecnico, e il rilievo senza tipo, vedono tutto", () => {
    expect(schemaPerTipo(schema, "tecnico")).toBe(schema);
    expect(schemaPerTipo(schema, null)).toBe(schema);
    expect(schemaPerTipo(null, "commerciale")).toBeNull();
  });
});
