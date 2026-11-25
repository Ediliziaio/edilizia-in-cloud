import { describe, expect, it } from "vitest";
import { htmlRegistroIva, type RigaIva } from "@/lib/contabilita/registroIva";

describe("registro IVA stampato e reverse charge", () => {
  it("le fatture in reverse charge senza integrazione confermata si dichiarano sul foglio", () => {
    const righe: RigaIva[] = [
      { date: "2026-10-05", periodDate: "2026-10-05", number: "5", counterparty: "Ditta", side: "acquisti", base: 3400000, tax: 0, rate: null, nature: "N6.3",
        issues: ["Reverse charge: aliquota di integrazione non confermata"] },
      { date: "2026-10-06", periodDate: "2026-10-06", number: "6", counterparty: "Fornitore", side: "acquisti", base: 10000, tax: 2200, rate: "22", nature: "" },
    ];
    const html = htmlRegistroIva({ azienda: { ragione_sociale: "Prova srl" }, righe, lato: "acquisti", dal: "2026-10-01", al: "2026-10-31" });
    expect(html).toContain("Reverse charge senza integrazione confermata: 1 riga");
    expect(html).toContain("34.000,00");
  });
});
