import { describe, expect, it } from "vitest";
import { orderEconomics } from "@/lib/orders/annualScope";
import { conIncassiUnita } from "@/lib/orders/incassiCommessa";
import type { OrderWithDetails } from "@/lib/orderUtils";

/**
 * Commesse generali (31/10/2026): caparre, acconti e saldi registrati sulle unità in vendita sono
 * incassi veri anche dove l'app leggeva solo rate e fatture. Stessi soldi in due posti: mai sommati.
 */
describe("incassi delle unità", () => {
  const base = { totaleLordo: 638_000, incassatoLordo: 0, daIncassareLordo: 638_000, incassatoNetto: 0, costoFinanziaria: 0 };

  it("pagina della commessa: le caparre dell'unità diventano l'incassato, il resto da incassare", () => {
    const i = conIncassiUnita(base, 80_000, 10);
    expect(i.incassatoLordo).toBe(80_000);
    expect(i.daIncassareLordo).toBe(558_000);
    expect(i.incassatoNetto).toBeCloseTo(72_727.27, 1);
  });

  it("se le rate dicono di più, restano le rate", () => {
    const conRate = { ...base, incassatoLordo: 100_000, daIncassareLordo: 538_000 };
    expect(conRate).toBe(conRate);
    expect(conIncassiUnita(conRate, 80_000, 10)).toBe(conRate);
  });

  it("riquadri della lista: si aggiunge solo la parte in più delle unità", () => {
    const o = { id: "u", total_amount: 1000, vat_rate: 0, deposit_amount: 0, balance_amount: 1000, deposit_paid: false, balance_paid: false } as OrderWithDetails;
    const senza = orderEconomics([o]);
    const con = orderEconomics([o], new Map([["u", 300]]));
    expect(con.collected - senza.collected).toBe(300);
    expect(senza.pending - con.pending).toBe(300);
  });
});
