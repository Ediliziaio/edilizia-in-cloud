import { describe, expect, it } from "vitest";
import { luogoConsegnaDDT } from "@/lib/ddt/luogoConsegna";

describe("luogo di consegna del DDT nel PDF", () => {
  it("stampa il luogo scritto a mano nell'editor (free_text)", () => {
    expect(luogoConsegnaDDT({ free_text: "Cantiere Via Roma 1, Milano  " })).toEqual({
      address: "Cantiere Via Roma 1, Milano", city: null, postal_code: null, province: null, riferimento: null,
    });
  });

  it("il testo scritto vince sul luogo di prima, come nell'editor; il riferimento resta", () => {
    expect(luogoConsegnaDDT({ address: "Via Vecchia 3", city: "Roma", riferimento: "Sig. Rossi", free_text: "Via Nuova 5, Torino" }))
      .toEqual({ address: "Via Nuova 5, Torino", city: null, postal_code: null, province: null, riferimento: "Sig. Rossi" });
  });

  it("senza testo scritto usa i campi divisi, con i nomi vecchi e nuovi", () => {
    expect(luogoConsegnaDDT({ via: "Via Roma 1", cap: "20121", comune: "Milano", provincia: "MI", free_text: "   " })).toEqual({
      address: "Via Roma 1", city: "Milano", postal_code: "20121", province: "MI", riferimento: null,
    });
    expect(luogoConsegnaDDT({ address: "Via Roma 1", postal_code: "20121", city: "Milano", province: "MI" })).toEqual({
      address: "Via Roma 1", city: "Milano", postal_code: "20121", province: "MI", riferimento: null,
    });
  });

  it("niente luogo: null; una stringa sola è il luogo", () => {
    expect(luogoConsegnaDDT(null)).toBeNull();
    expect(luogoConsegnaDDT(undefined)).toBeNull();
    expect(luogoConsegnaDDT("  ")).toBeNull();
    expect(luogoConsegnaDDT("Via Roma 1, Milano")).toEqual({ address: "Via Roma 1, Milano" });
  });
});
