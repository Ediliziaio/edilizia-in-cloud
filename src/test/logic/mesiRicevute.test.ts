import { describe, expect, it } from "vitest";
import { mesiRicevute, type RicevutaPerMesi } from "@/lib/fatturazione/mesiRicevute";
import { coloreDaRiempimento, COLORI_GRAFICO } from "@/components/charts/grafici/comune";

const f = (p: Partial<RicevutaPerMesi> & { id: string }): RicevutaPerMesi => ({
  data_fattura: "2026-03-10", tipo_documento: "TD01", totale_documento: 122, imponibile_totale: 100, iva_totale: 22, ...p,
});

describe("i mesi delle fatture ricevute", () => {
  const pagate = new Set(["p"]);
  const stato = {
    pagata: (x: RicevutaPerMesi) => pagate.has(x.id),
    stornata: (x: RicevutaPerMesi) => x.id === "s",
    rate: (x: RicevutaPerMesi) => (x.id === "r" ? { pagate: 1, totali: 2 } : undefined),
  };

  it("somma per mese, toglie le note di credito e salta rifiutate e altri anni", () => {
    const mesi = mesiRicevute([
      f({ id: "a" }),
      f({ id: "nc", tipo_documento: "TD04", totale_documento: 22, imponibile_totale: 18, iva_totale: 4 }),
      f({ id: "x", stato: "rifiutata" }),
      f({ id: "y", data_fattura: "2025-03-10" }),
    ], 2026, stato, "2026-11-16");
    const marzo = mesi[2];
    expect(marzo.docCount).toBe(2);
    expect(marzo.totalAmount).toBe(100);
    expect(marzo.imponibile).toBe(82);
    expect(marzo.iva).toBe(18);
    expect(mesi[0].docCount).toBe(0);
  });

  it("pagato, da pagare e scaduto: pagata intera, a rate in parte, netto della ritenuta", () => {
    const mesi = mesiRicevute([
      f({ id: "p" }),
      f({ id: "r", totale_documento: 200 }),
      f({ id: "d", netto_a_pagare: 100, piano_pagamento: [{ scadenza: "2026-04-30" }] }),
      f({ id: "s" }),
    ], 2026, stato, "2026-11-16");
    const marzo = mesi[2];
    expect(marzo.incassato).toBe(122 + 100);
    expect(marzo.daIncassare).toBe(100 + 100);
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
