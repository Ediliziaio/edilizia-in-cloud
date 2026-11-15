import { describe, expect, it } from "vitest";
import { coefficienteAnno, parseCoefficiente } from "@/lib/controlloGestione/coefficientiTfr";

describe("coefficienti ISTAT del TFR", () => {
  it("legge il coefficiente scritto all'italiana o col punto", () => {
    expect(parseCoefficiente("4,285617")).toBe(4.285617);
    expect(parseCoefficiente("4.285617")).toBe(4.285617);
    expect(parseCoefficiente(" 2,320017 % ")).toBe(2.320017);
    expect(parseCoefficiente("")).toBeNull();
    expect(parseCoefficiente("abc")).toBeNull();
  });

  it("usa dicembre quando c'è", () => {
    expect(coefficienteAnno([{ mese: 9, coefficiente_pct: 1.8 }, { mese: 12, coefficiente_pct: 2.311148 }]))
      .toEqual({ valore: 2.311148, stimato: false, mese: 12 });
  });

  it("senza dicembre stima dall'ultimo mese, con l'1,5% per l'anno intero (come il database)", () => {
    const r = coefficienteAnno([{ mese: 8, coefficiente_pct: 3.710988 }, { mese: 9, coefficiente_pct: 4.285617 }]);
    expect(r.stimato).toBe(true);
    expect(r.mese).toBe(9);
    expect(r.valore).toBeCloseTo(4.660617, 6);
  });

  it("senza mesi vale l'1,5% fisso", () => {
    expect(coefficienteAnno([])).toEqual({ valore: 1.5, stimato: true, mese: null });
  });
});
