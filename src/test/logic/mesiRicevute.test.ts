import { describe, expect, it } from "vitest";
import { mesiRicevute, type RicevutaPerMesi } from "@/lib/fatturazione/mesiRicevute";
import { coloreDaRiempimento, COLORI_GRAFICO } from "@/components/charts/grafici/comune";

const f = (p: Partial<RicevutaPerMesi> & { id: string }): RicevutaPerMesi => ({
  data_fattura: "2026-03-10", tipo_documento: "TD01", totale_documento: 122, imponibile_totale: 100, iva_totale: 22, ...p,
});

describe("i mesi delle fatture ricevute", () => {
  const saldi = new Map([
    ["p", { pagato: 122, residuo: 0 }],
    ["r", { pagato: 300, residuo: 700 }],
    ["d", { pagato: 0, residuo: 100 }],
    ["s", { pagato: 0, residuo: 0 }],
  ]);

  it("somma per mese, toglie le note di credito e salta rifiutate e altri anni", () => {
    const mesi = mesiRicevute([
      f({ id: "a" }),
      f({ id: "nc", tipo_documento: "TD04", totale_documento: 22, imponibile_totale: 18, iva_totale: 4 }),
      f({ id: "x", stato: "rifiutata" }),
      f({ id: "y", data_fattura: "2025-03-10" }),
    ], 2026, saldi, "2026-11-16");
    const marzo = mesi[2];
    expect(marzo.docCount).toBe(2);
    expect(marzo.totalAmount).toBe(100);
    expect(marzo.imponibile).toBe(82);
    expect(marzo.iva).toBe(18);
    expect(mesi[0].docCount).toBe(0);
  });

  it("somma i saldi effettivi, anche con rate di importi diversi", () => {
    const mesi = mesiRicevute([
      f({ id: "p" }),
      f({ id: "r", totale_documento: 1_000 }),
      f({ id: "d", netto_a_pagare: 100, piano_pagamento: [{ scadenza: "2026-04-30" }] }),
      f({ id: "s" }),
    ], 2026, saldi, "2026-11-16");
    const marzo = mesi[2];
    expect(marzo.incassato).toBe(122 + 300);
    expect(marzo.daIncassare).toBe(700 + 100);
    expect(marzo.scaduto).toBe(100);
  });
});

describe("colore del pallino nel tooltip", () => {
  it("dalla sfumatura risale al colore della serie", () => {
    expect(coloreDaRiempimento("url(#abc-barra-verde)")).toBe(COLORI_GRAFICO.verde);
    expect(coloreDaRiempimento("url(#abc-sfuma-rosso)")).toBe(COLORI_GRAFICO.rosso);
    expect(coloreDaRiempimento("url(#strano)")).toBe(COLORI_GRAFICO.blu);
    expect(coloreDaRiempimento("#123456")).toBe("#123456");
  });
});
