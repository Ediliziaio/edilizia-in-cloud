import { describe, expect, it } from "vitest";
import { etichettaSaldoGrafico, pianiFinanziamentoPdf } from "@/lib/serramenti/economiaPdf";

const piano = { nome: "Standard", mesi: 60, tasso: 5.5, rata_mese: 124.57, anticipo: 0, finanziato: 6000 };

describe("Economia PDF serramenti", () => {
  it("non stampa i vecchi piani dopo il cambio della modalita di pagamento", () => {
    expect(pianiFinanziamentoPdf(false, [piano])).toEqual([]);
    expect(pianiFinanziamentoPdf(true, [piano])).toEqual([piano]);
  });
  it.each([null, undefined, {}, [null], [{ ...piano, mesi: 0 }], [{ ...piano, rata_mese: NaN }],
    [{ ...piano, finanziato: Infinity }], [{ ...piano, tasso: -1 }], [{ ...piano, anticipo: -1 }]])(
    "non presenta dati incompleti o non finiti come una simulazione valida: %j", value => {
      expect(pianiFinanziamentoPdf(true, value)).toEqual([]);
    });
  it("mantiene il piano a tasso zero e tutti i centesimi", () => {
    expect(pianiFinanziamentoPdf(true, [{ ...piano, tasso: 0 }])[0]).toMatchObject({ tasso: 0, rata_mese: 124.57 });
  });
  it.each([[0, "€ 0"], [-230, "-€ 230"], [850, "€ 850"], [1250, "€ 1,3k"], [-1250000, "-€ 1,3 mln"]])(
    "asse in euro leggibile anche sotto mille: %s", (value, expected) => {
      expect(etichettaSaldoGrafico(Number(value))).toBe(expected);
    });
  it("non confonde i saldi piccoli con zero", () => {
    expect(etichettaSaldoGrafico(-0.25)).toBe("-€ 0,25");
  });
});
