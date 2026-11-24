import { describe, expect, it } from "vitest";
import { normalizzaModelloGenerato } from "../../../shared/sopralluoghi/modelloGenerato";

describe("modello scritto dall'AI, ripulito", () => {
  it("corregge tipi, chiavi e scelte; toglie ciò che non serve; tiene la riga del preventivo valida", () => {
    const { schema, avvisi } = normalizzaModelloGenerato({
      area_definition: { label: "Stanza", label_plural: "Stanze", name_suggestions: ["Cucina", "Bagno"] },
      element_types: [
        { key: "Box Doccia", label: "Box doccia", sections: [{ label: "Misure", fields: [
          { key: "Larghezza cm", label: "Larghezza", type: "dimension", unit: "pollici", required: true },
          { label: "Profondità", type: "dimension" },
          { label: "Profondità", type: "dimension" },
          { label: "Vetro", type: "select", options: ["Trasparente", "Satinato"] },
          { label: "Apertura", type: "select", options: ["Unica"] },
          { label: "Colore profilo", type: "colore" },
          { label: "Sifone", type: "text", solo_tecnico: true },
        ] }] },
        { label: "Vuoto", sections: [{ label: "Nulla", fields: [] }] },
      ],
      output_mapping: { estimate_lines: { "Box Doccia": { description_template: "Box {vetro} {larghezza_cm}x{profondita} {inventato}", unit: "pezzi", quantity_field: "larghezza_cm" } } },
    });
    const tipo = schema.element_types[0] as { key: string; sections: Array<{ fields: Array<Record<string, unknown>> }> };
    expect(tipo.key).toBe("box_doccia");
    const campi = tipo.sections[0].fields;
    expect(campi.map((f) => f.key)).toEqual(["larghezza_cm", "profondita", "profondita_2", "vetro", "apertura", "colore_profilo", "sifone"]);
    expect(campi[0]).toMatchObject({ type: "dimension", unit: "cm", required: true });
    expect(campi[3].options).toEqual([{ value: "trasparente", label: "Trasparente" }, { value: "satinato", label: "Satinato" }]);
    expect(campi[4].type).toBe("text");
    expect(campi[5].type).toBe("text");
    expect(campi[6].solo_tecnico).toBe(true);
    expect(schema.element_types).toHaveLength(1);
    expect(schema.output_mapping.estimate_lines.box_doccia).toEqual({ description_template: "Box {vetro} {larghezza_cm}x{profondita}", unit: "pz", quantity_field: "larghezza_cm" });
    expect(schema.area_definition).toMatchObject({ label: "Stanza", name_suggestions: ["Cucina", "Bagno"] });
    expect(avvisi.join(" | ")).toMatch(/«Apertura».*diventa testo/);
    expect(avvisi.join(" | ")).toMatch(/«Vuoto» non aveva campi validi/);
    expect(avvisi.join(" | ")).toMatch(/tolti campi che non esistono \(inventato\)/);
  });
  it("risposta vuota o rotta: un modello vuoto con l'avviso, mai un'eccezione", () => {
    for (const x of [null, "testo", 42, { element_types: "no" }]) {
      const e = normalizzaModelloGenerato(x);
      expect(e.schema.element_types).toEqual([]);
      expect(e.avvisi.at(-1)).toMatch(/Nessun tipo di elemento valido/);
    }
  });
});
