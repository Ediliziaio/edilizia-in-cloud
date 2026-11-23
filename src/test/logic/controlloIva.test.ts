import { describe, expect, it } from "vitest";
import { avvisoPeriodo, incompletiPerPeriodo, mesiInLettere, type DocumentoSenzaImporti } from "@/lib/contabilita/controlloIva";

// Il caso del 23/11/2026: un anno importato a novembre, col solo totale fino a luglio.
const documenti: DocumentoSenzaImporti[] = [
  { data: "2026-01-15", lato: "emesse" },
  { data: "2026-01-31", lato: "ricevute" },
  { data: "2026-02-01", lato: "ricevute" },
  { data: "2026-07-31", lato: "ricevute" },
  { data: "2026-07-10", lato: "emesse" },
];

describe("documenti senza importi per periodo", () => {
  it("conta per mese, estremi compresi", () => {
    const c = incompletiPerPeriodo(documenti, [
      { dal: "2026-01-01", al: "2026-01-31" },
      { dal: "2026-02-01", al: "2026-02-28" },
      { dal: "2026-08-01", al: "2026-08-31" },
    ]);
    expect(c).toEqual([{ emesse: 1, ricevute: 1 }, { emesse: 0, ricevute: 1 }, { emesse: 0, ricevute: 0 }]);
  });

  it("conta per trimestre", () => {
    const c = incompletiPerPeriodo(documenti, [{ dal: "2026-07-01", al: "2026-09-30" }]);
    expect(c).toEqual([{ emesse: 1, ricevute: 1 }]);
  });

  it("l'avviso dice quanti, e niente se il periodo è completo", () => {
    expect(avvisoPeriodo({ emesse: 6, ricevute: 94 })).toBe("6 emesse e 94 ricevute senza importi");
    expect(avvisoPeriodo({ emesse: 1, ricevute: 0 })).toBe("1 emessa senza importi");
    expect(avvisoPeriodo({ emesse: 0, ricevute: 0 })).toBe("");
    expect(avvisoPeriodo(undefined)).toBe("");
  });

  it("i mesi in una riga, raggruppati", () => {
    expect(mesiInLettere(documenti.map((d) => d.data))).toBe("gennaio–febbraio, luglio");
    expect(mesiInLettere(["2026-03-01", "2026-05-02", "2026-06-30"])).toBe("marzo, maggio–giugno");
    expect(mesiInLettere([])).toBe("");
  });
});
