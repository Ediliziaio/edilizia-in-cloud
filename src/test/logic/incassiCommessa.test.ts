import { describe, expect, it } from "vitest";
import { incassiDellaCommessa, totaleFatturato } from "@/lib/orders/incassiCommessa";

const rata = (over: Record<string, unknown>) => ({ id: String(Math.random()), type: "deposit", amount: 0, is_paid: false, position: 0, ...over });

describe("incassi della commessa: una regola per tutti i riquadri", () => {
  it("senza finanziamento il costo della finanziaria non si toglie", () => {
    const r = incassiDellaCommessa({ installments: [rata({ amount: 2440, is_paid: true })], totalAmount: 10000, vatRate: 22, paymentType: "standard", financingCost: 500 });
    expect(r.totaleLordo).toBe(12200);
    expect(r.incassatoLordo).toBe(2440);
    expect(r.daIncassareLordo).toBe(9760);
  });
  it("con finanziamento la rata della finanziaria è incassata e il suo costo si toglie dal totale", () => {
    const r = incassiDellaCommessa({
      installments: [rata({ type: "deposit", amount: 2200, is_paid: true, position: 0 }), rata({ type: "financing", amount: 9500, is_paid: true, position: 1 })],
      totalAmount: 10000, vatRate: 22, paymentType: "financing", financingCost: 500,
    });
    expect(r.totaleLordo).toBe(11700);
    expect(r.incassatoLordo).toBe(11700);
    expect(r.daIncassareLordo).toBe(0);
    expect(r.incassatoNetto).toBeCloseTo(11700 / 1.22, 2);
  });
});

describe("totale fatturato", () => {
  it("conta solo le fatture vere e toglie le note di credito", () => {
    expect(totaleFatturato([
      { tipo: "fattura", stato: "pagata", totale_documento: 1000 },
      { tipo: "fattura", stato: "bozza", totale_documento: 999 },
      { tipo: "fattura", stato: "annullata", totale_documento: 999 },
      { tipo: "fattura", stato: "rifiutata", totale_documento: 999 },
      { tipo: "fattura", stato: "in_invio", totale_documento: 999 },
      { tipo: "proforma", stato: "emessa", totale_documento: 500 },
      { tipo: "ddt", stato: "emesso", totale_documento: 0 },
      { tipo: "nota_credito", stato: "emessa", totale_documento: 200 },
    ])).toBe(800);
  });

  it("usa la quota assegnata alla commessa quando c'è, altrimenti il totale del documento, mai il totale da pagare", () => {
    expect(totaleFatturato([
      // fattura divisa su due commesse: qui ne vale una parte
      { tipo: "fattura", stato: "emessa", totale_documento: 10000, importo_associato: 4000, totale_da_pagare: 9000 } as never,
      // con ritenuta: il totale da pagare è più basso del documento
      { tipo: "fattura", stato: "pagata", totale_documento: 1220, importo_associato: null, totale_da_pagare: 1120 } as never,
      { tipo: "nota_credito", stato: "emessa", totale_documento: 500, importo_associato: 300 },
    ])).toBe(4000 + 1220 - 300);
  });
});
