import { describe, expect, it } from "vitest";
import { directMarginSummary, registeredPayables, groupedSummaryCards, netOrderTotals } from "@/lib/orders/summaryIndicators";
const row = (id: string, revenue: number, costs: number) => ({ id, preventivo_totale: revenue, consuntivo: costs, margine: revenue - costs, margine_perc: 0 });
describe("Margini diretti del riepilogo", () => {
  it("pondera sui ricavi invece di fare la media semplice", () => {
    const result = directMarginSummary([row("a",100,50),row("b",900,810)],new Set(["a","b"]));
    expect(result.margin).toBe(140); expect(result.percentage).toBeCloseTo(14);
  });
  it("sul conseguito usa soltanto gli id delle commesse completate", () => {
    expect(directMarginSummary([row("chiusa",100,120),row("aperta",900,100)],new Set(["chiusa"]))).toMatchObject({count:1,margin:-20,percentage:-20});
  });
  it("non trasforma costi assenti o righe mancanti in margini del 100%", () => {
    expect(directMarginSummary([row("a",100,0)],new Set(["a","b"]))).toMatchObject({count:0,missing:2,margin:null,percentage:null});
  });
});

describe("Costi registrati ancora da pagare", () => {
  it("usa il residuo di fatture aperte e parziali, non impegni o lavori futuri", () => {
    expect(registeredPayables([
      {stato:"scaduto",residuo:50},{stato:"parziale",residuo:25},{stato:"da_pagare",residuo:100},
      {stato:"fattura_da_arrivare",residuo:900},{stato:"da_maturare",residuo:800},{stato:"pagato",residuo:0},
    ])).toBe(175);
  });
});

describe("Schede economiche raggruppate", () => {
  it("mantiene venduto e fatturato distinti accorpando il residuo negli incassi", () => {
    expect(groupedSummaryCards(["fatturato", "incassato", "costi", "da_incassare"])).toEqual(["venduto", "fatturato", "incassato", "costi"]);
  });
  it("non aggiunge importi ai riquadri operativi di chi non può vederli", () => {
    expect(groupedSummaryCards(["commesse", "aperte"])).toEqual(["commesse", "aperte"]);
  });
});

describe("Imponibile e IVA del riepilogo", () => {
  it("scorpora aliquote differenti riga per riga, compresa IVA zero", () => {
    expect(netOrderTotals([
      {sold:122,collected:61,pending:61,vatRate:22},
      {sold:110,collected:55,pending:55,vatRate:10},
      {sold:100,collected:100,pending:0,vatRate:0},
    ])).toEqual({sold:300,collected:200,pending:100,missing:0});
  });
  it("non inventa il netto se manca l'aliquota di una commessa con importi", () => {
    expect(netOrderTotals([{sold:122,collected:61,pending:61,vatRate:null}])).toEqual({sold:null,collected:null,pending:null,missing:1});
  });
});
