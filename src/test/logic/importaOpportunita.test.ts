import { describe, expect, it } from "vitest";
import { campiContattoImport, datiContattoDaRiga, valoriCustomContatto } from "@/lib/marketing/importaOpportunita";

describe("i campi del contatto nell'importazione delle opportunità", () => {
  it("propone città, provincia, azienda e i campi personalizzati del contatto", () => {
    const campi = campiContattoImport([{ id: "f1", name: "Tipo tetto" }]);
    expect(campi.map((c) => c.label)).toEqual(["Azienda Contatto", "Città Contatto", "Provincia Contatto", "Tipo tetto (contatto)"]);
    expect(campi.every((c) => !c.required)).toBe(true);
    expect(campi[3].key).toBe("contact_custom_f1");
  });

  it("porta i dati della riga sul contatto nuovo; senza fonte è un'importazione", () => {
    expect(datiContattoDaRiga({ contact_city: " Padova ", contact_province: "", source: "Fiera" }))
      .toEqual({ company_name: null, city: "Padova", province: null, source: "Fiera" });
    expect(datiContattoDaRiga({}).source).toBe("importazione");
  });

  it("salva solo i campi personalizzati del contatto, e non quelli vuoti", () => {
    expect(valoriCustomContatto({
      contact_custom_f1: " Falde ", contact_custom_f2: "  ", custom_o1: "dell'opportunità", contact_city: "Padova",
    }, "c1")).toEqual([{ contact_id: "c1", field_id: "f1", value: "Falde" }]);
  });
});
