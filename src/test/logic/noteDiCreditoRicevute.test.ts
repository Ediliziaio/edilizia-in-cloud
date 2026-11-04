import { describe, expect, it } from "vitest";
import { eAutofattura, eNotaDiCredito, importoFornitori, nonSiPaga, testoRatePagate } from "@/lib/fatturazione/noteDiCredito";

describe("documenti che non si pagano", () => {
  it("note di credito e autofatture no, fatture e differite sì", () => {
    for (const t of ["TD04", "TD08", "TD16", "TD17", "TD18", "TD19"]) expect(nonSiPaga(t)).toBe(true);
    for (const t of ["TD01", "TD24", "TD06", "TD02", null]) expect(nonSiPaga(t)).toBe(false);
    expect(eNotaDiCredito("TD17")).toBe(false);
    expect(eAutofattura("TD04")).toBe(false);
  });
});

describe("testoRatePagate", () => {
  it("singolare e plurale", () => {
    expect(testoRatePagate(1, 3)).toBe("Pagata 1 rata su 3");
    expect(testoRatePagate(2, 3)).toBe("Pagate 2 rate su 3");
  });
});

describe("importoFornitori", () => {
  it("la nota di credito toglie con entrambi i segni", () => {
    expect(importoFornitori([
      { tipo_documento: "TD01", totale_documento: 1000 },
      { tipo_documento: "TD04", totale_documento: 100 },
      { tipo_documento: "TD04", totale_documento: -50 },
    ])).toBe(850);
  });

  it("dell'autofattura conta l'imponibile, non l'IVA che si compensa", () => {
    expect(importoFornitori([{ tipo_documento: "TD18", totale_documento: 122, imponibile_totale: 100 }])).toBe(100);
  });

  it("una fattura senza importi conta zero", () => {
    expect(importoFornitori([{ tipo_documento: "TD01", totale_documento: null }])).toBe(0);
  });
});
