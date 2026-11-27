import { describe, expect, it } from "vitest";
import { mesiRicevute, scadutoRicevuta, type RicevutaPerMesi } from "@/lib/fatturazione/mesiRicevute";
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

describe("quanto è scaduto di una fattura ricevuta", () => {
  const piano = [{ scadenza: "2026-10-31", importo: 1263.42 }, { scadenza: "2026-11-30", importo: 1263.42 }];
  it("la rata scaduta non pagata conta anche se la successiva deve ancora arrivare", () => {
    // La rata del 31/10 era «segnata pagata» senza pagamento: il server l'ha rimessa nel residuo.
    expect(scadutoRicevuta(piano, 0, 2526.84, "2026-11-27")).toBeCloseTo(1263.42);
  });
  it("la rata scaduta pagata davvero non è scaduta", () => {
    expect(scadutoRicevuta(piano, 1263.42, 1263.42, "2026-11-27")).toBe(0);
  });
  it("tutte scadute: tutto il residuo, mai di più", () => {
    expect(scadutoRicevuta(piano, 1000, 1526.84, "2026-12-15")).toBeCloseTo(1526.84);
    expect(scadutoRicevuta(piano, 0, 100, "2026-12-15")).toBe(100);
  });
  it("piano senza importi: come prima, conta la prossima scadenza", () => {
    expect(scadutoRicevuta([{ scadenza: "2026-04-30" }], 0, 100, "2026-11-16")).toBe(100);
    expect(scadutoRicevuta([{ scadenza: "2026-12-30" }], 0, 100, "2026-11-16")).toBe(0);
    expect(scadutoRicevuta(null, 0, 100, "2026-11-16")).toBe(0);
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
