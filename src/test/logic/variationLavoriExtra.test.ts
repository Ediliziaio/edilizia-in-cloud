import { describe, expect, it } from "vitest";
import { emptyVariationDraft } from "@/lib/orders/variationDraft";
import { validateVariationWorkspace } from "@/lib/orders/variationWorkspace";

const id = "11111111-1111-4111-8111-111111111111";

describe("Lavoro extra → Lavorazioni: dove va e chi lo fa, nella bozza", () => {
  it("tiene destinazione e chi, solo nella forma giusta", () => {
    const { content } = validateVariationWorkspace({ ...emptyVariationDraft(), destinazione: "fase", chi: [{ tipo: "persona", id, nome: "Mario Rossi" }] }, {});
    expect(content.destinazione).toBe("fase");
    expect(content.chi).toEqual([{ tipo: "persona", id, nome: "Mario Rossi" }]);
  });

  it("senza i campi nuovi la bozza di prima resta valida (fase nuova, nessuno)", () => {
    const { content } = validateVariationWorkspace({ ...emptyVariationDraft() }, {});
    expect(content.destinazione).toBeUndefined();
    expect(content.chi).toBeUndefined();
  });

  it("rifiuta destinazioni sconosciute, id non validi, tipi sconosciuti e troppi nomi", () => {
    const base = { ...emptyVariationDraft() };
    expect(() => validateVariationWorkspace({ ...base, destinazione: "altrove" }, {})).toThrow(/Destinazione/);
    expect(() => validateVariationWorkspace({ ...base, chi: [{ tipo: "persona", id: "1; drop table", nome: "X" }] }, {})).toThrow(/non è valido/);
    expect(() => validateVariationWorkspace({ ...base, chi: [{ tipo: "cliente", id, nome: "X" }] }, {})).toThrow(/non è valido/);
    expect(() => validateVariationWorkspace({ ...base, chi: Array.from({ length: 21 }, () => ({ tipo: "ditta", id, nome: "D" })) }, {})).toThrow(/20/);
  });
});
