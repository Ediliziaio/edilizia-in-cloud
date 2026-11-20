import { describe, expect, it } from "vitest";
import { calcoloAcquistoAssistito, specificheConCalcolo } from "@/lib/distinta/calcoloAcquistoAssistito";
import { sembraTavola } from "@/lib/distinta/sceltaTavola";
describe("calcolo esplicito della fornitura", () => {
  it("distingue copertura da consumo, applica mani e sfrido, poi arrotonda alle confezioni intere", () => {
    const r = calcoloAcquistoAssistito({ base: 120, resa: 10, modo: "copertura", mani: 2, sfrido: 10, confezione: 10 });
    expect(r.netto).toBe(24); expect(r.totale).toBeCloseTo(26.4); expect(r.confezioni).toBe(3); expect(r.avanzo).toBeCloseTo(3.6);
    expect(calcoloAcquistoAssistito({ base: 120, resa: 0.1, modo: "consumo", mani: 2, sfrido: 10 }).totale).toBeCloseTo(r.totale);
  });
  it("non aggiunge una confezione per un errore decimale né accetta rese o confezioni non valide", () => {
    expect(calcoloAcquistoAssistito({ base: 100, resa: 0.1, modo: "consumo", mani: 3, sfrido: 0, confezione: 10 }).confezioni).toBe(3);
    for (const extra of [{ resa: 0 }, { base: -1 }, { mani: 1.5 }, { sfrido: -1 }, { confezione: 0 }, { resa: Infinity }]) {
      expect(() => calcoloAcquistoAssistito({ base: 100, resa: 2, modo: "consumo", mani: 1, sfrido: 0, ...extra })).toThrow();
    }
  });
  it("un nuovo confezionamento sostituisce l'ipotesi precedente senza cancellare le specifiche del prodotto", () => {
    const originale = "Adesivo per travertino · Ipotesi di confezione da confermare: 88,65 kg = 4 sacchi da 25 kg · EPD A";
    const nuova = "Confezione d'acquisto: 10 l per latta.";
    const risultato = specificheConCalcolo(originale, nuova);
    expect(risultato).toContain("Adesivo per travertino"); expect(risultato).toContain("EPD A");
    expect(risultato).not.toContain("4 sacchi"); expect(risultato).toContain(nuova);
    expect(specificheConCalcolo(risultato, nuova)).toBe(risultato);
    expect(originale).toContain("4 sacchi");
  });
});
it("suggerisce le tavole dal nome senza trattare preventivi e PDF generici come planimetrie", () => {
  expect(sembraTavola("Tavola impianto.pdf")).toBe(true);
  expect(sembraTavola("planimetria piano terra.pdf")).toBe(true);
  expect(sembraTavola("Trovato Vincenzo.pdf")).toBe(false);
  expect(sembraTavola("Preventivo schema impianto.pdf")).toBe(false);
});
