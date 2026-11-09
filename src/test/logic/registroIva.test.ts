/**
 * I registri IVA da stampare (09/11/2026). Gli importi arrivano in centesimi:
 * il posto dove si sbaglia è proprio lì.
 */
import { describe, expect, it } from "vitest";
import {
  htmlRegistroIva,
  perAliquota,
  righeExcelIva,
  totaliIva,
  type RigaIva,
} from "@/lib/contabilita/registroIva";

const r = (over: Partial<RigaIva> = {}): RigaIva => ({
  date: "2026-03-10",
  periodDate: "2026-03-10",
  number: "FT/2026/10",
  counterparty: "Rossi Costruzioni S.r.l.",
  side: "vendite",
  base: 100_000, // 1.000,00 €
  tax: 22_000, //    220,00 €
  rate: "22",
  nature: "",
  ...over,
});

const azienda = { ragione_sociale: "Edil Prova S.r.l.", partita_iva: "01234567890" };

describe("I totali", () => {
  it("dai centesimi agli euro, senza perderne per strada", () => {
    const t = totaliIva([r(), r({ base: 33_333, tax: 7_333 })]);
    expect(t.imponibile).toBe(1333.33);
    expect(t.imposta).toBe(293.33);
  });

  it("conta i documenti, non le righe: una fattura con due aliquote è una", () => {
    const t = totaliIva([
      r({ rate: "22", base: 100_000, tax: 22_000 }),
      r({ rate: "10", base: 50_000, tax: 5_000 }),
    ]);
    expect(t.documenti).toBe(1);
    expect(t.imponibile).toBe(1500);
  });

  it("una riga senza imponibile non diventa zero per finta", () => {
    expect(totaliIva([r({ base: null, tax: null })]).imponibile).toBe(0);
  });
});

describe("Il riepilogo per aliquota", () => {
  it("raggruppa per aliquota, dalla più alta", () => {
    const g = perAliquota([
      r({ rate: "10", base: 50_000, tax: 5_000 }),
      r({ rate: "22", base: 100_000, tax: 22_000 }),
      r({ rate: "22", base: 20_000, tax: 4_400 }),
    ]);
    expect(g.map((x) => x.chiave)).toEqual(["22%", "10%"]);
    expect(g[0]).toMatchObject({ imponibile: 1200, imposta: 264, righe: 2 });
  });

  it("senza aliquota comanda la natura: un'esente non è «0%»", () => {
    const g = perAliquota([
      r({ rate: null, nature: "N4", base: 30_000, tax: 0 }),
      r({ rate: null, nature: "N6.7", base: 10_000, tax: 0 }),
    ]);
    expect(g.map((x) => x.chiave)).toEqual(["N4", "N6.7"]);
  });

  it("le aliquote stanno prima delle nature", () => {
    const g = perAliquota([r({ rate: null, nature: "N4" }), r({ rate: "4" })]);
    expect(g[0].chiave).toBe("4%");
  });
});

describe("Il foglio da stampare", () => {
  const html = htmlRegistroIva({
    azienda,
    righe: [r(), r({ rate: "10", base: 50_000, tax: 5_000, number: "FT/2026/11" })],
    lato: "vendite",
    dal: "2026-01-01",
    al: "2026-03-31",
  });

  it("dice quale registro è, di chi e di che periodo", () => {
    expect(html).toContain("Registro IVA vendite");
    expect(html).toContain("Edil Prova S.r.l.");
    expect(html).toContain("Dal 01/01/2026 al 31/03/2026");
  });

  it("negli acquisti la colonna del periodo è la data di detrazione", () => {
    const acquisti = htmlRegistroIva({ azienda, righe: [r({ side: "acquisti" })], lato: "acquisti", dal: "2026-01-01", al: "2026-03-31" });
    expect(acquisti).toContain("Detrazione");
    expect(acquisti).toContain("Fornitore");
    expect(acquisti).toMatch(/data di detrazione/);
  });

  it("chiude col riepilogo per aliquota e col totale imposta", () => {
    expect(html).toContain("22% — imponibile");
    expect(html).toContain("10% — imponibile");
    expect(html).toContain("Totale imposta");
  });

  it("le migliaia hanno il punto", () => {
    expect(html).toContain("1.000,00");
  });

  it("senza documenti lo dice", () => {
    const vuoto = htmlRegistroIva({ azienda, righe: [], lato: "acquisti", dal: "2026-01-01", al: "2026-03-31" });
    expect(vuoto).toContain("Nessun documento in questo periodo.");
  });

  it("«tutti» aggiunge la colonna che dice da quale registro viene la riga", () => {
    const tutti = htmlRegistroIva({ azienda, righe: [r(), r({ side: "acquisti" })], lato: "tutti", dal: "2026-01-01", al: "2026-03-31" });
    expect(tutti).toContain("Registro");
    expect(tutti).toContain("Acquisti");
  });
});

describe("Il foglio Excel", () => {
  it("porta gli euro, non i centesimi, e segnala le proiezioni", () => {
    const righe = righeExcelIva([r(), r({ synthetic: true, base: 20_000, tax: 4_400 })]);
    expect(righe[0]).toMatchObject({ imponibile: 1000, imposta: 220, aliquota: "22%", nota: "" });
    expect(righe[1].nota).toMatch(/non registrazione/);
    expect(typeof righe[0].imponibile).toBe("number");
  });
});
