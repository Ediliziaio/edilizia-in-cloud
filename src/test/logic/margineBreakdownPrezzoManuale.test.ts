import { describe, it, expect } from "vitest";
import { computeBreakdown } from "@/hooks/useMargineBreakdown";

/**
 * QuoteMargini / useMargineBreakdown — aggregato col prezzo scritto a mano (21/09/2026).
 *
 * Quando quotes.prezzo_manuale è attivo le righe restano a 0€ di vendita (nessun
 * prezzo dal listino): la somma delle righe direbbe "margine -100%" su un
 * preventivo che invece va benissimo. Stessa filosofia di QuoteQuickViewSheet.tsx
 * e usePreventivoCosti.ts::calcolaTotaliPreventivo — il ricavo vero per
 * l'AGGREGATO viene da quotes.subtotal - discount_amount, i costi restano quelli
 * reali delle righe, e il dettaglio per riga NON cambia (limite noto, non un bug).
 */

interface TestQuoteItem {
  id: string;
  quote_id: string;
  item_type: string | null;
  item_category: string | null;
  name: string;
  quantity: number | null;
  unit_price: number | null;
  discount_percent: number | null;
  tariffa_id: string | null;
  prezzo_acquisto: number | null;
  costo_unitario: number | null;
}

const mkItem = (over: Partial<TestQuoteItem> = {}): TestQuoteItem => ({
  id: "item-1",
  quote_id: "quote-1",
  item_type: "product",
  item_category: null,
  name: "Voce",
  quantity: 1,
  unit_price: 0,
  discount_percent: 0,
  tariffa_id: null,
  prezzo_acquisto: 0,
  costo_unitario: null,
  ...over,
});

describe("computeBreakdown — senza prezzo manuale (regressione)", () => {
  it("aggregato = somma delle righe, come prima", () => {
    const items = [
      mkItem({ id: "a", unit_price: 100, quantity: 2, prezzo_acquisto: 60 }),
      mkItem({ id: "b", unit_price: 50, quantity: 1, prezzo_acquisto: 20 }),
    ];
    const r = computeBreakdown(items, [], [], {});
    expect(r.totale_vendita).toBe(250);
    expect(r.totale_costo).toBe(140);
    expect(r.margine_totale_euro).toBe(110);
    expect(r.margine_totale_pct).toBeCloseTo(44, 6);
    expect(r.prezzo_manuale_attivo).toBe(false);
  });
});

describe("computeBreakdown — prezzo scritto a mano attivo", () => {
  it("l'aggregato usa subtotal - discount_amount, non la somma delle righe (a 0€)", () => {
    // Come nel builder senza listino caricato: righe a 0€ di vendita, costi reali.
    const items = [
      mkItem({ id: "a", unit_price: 0, quantity: 3, prezzo_acquisto: 200 }),
      mkItem({ id: "b", unit_price: 0, quantity: 1, prezzo_acquisto: 150 }),
    ];
    const quoteRicavo = { prezzo_manuale: 5000, subtotal: 5000, discount_amount: 500 };
    const r = computeBreakdown(items, [], [], {}, quoteRicavo);

    // Dettaglio per riga: NON cambia, resta a 0€ (limite noto, non toccato qui).
    expect(r.righe.every((riga) => riga.totale_vendita === 0)).toBe(true);
    expect(r.righe[0].margine_euro).toBe(-600);

    // Aggregato: ricavo vero (5000 - 500), costo reale dalle righe, margine coerente.
    expect(r.totale_vendita).toBe(4500);
    expect(r.totale_costo).toBe(750);
    expect(r.margine_totale_euro).toBe(3750);
    expect(r.margine_totale_pct).toBeCloseTo(83.333333, 5);
    expect(r.prezzo_manuale_attivo).toBe(true);
  });

  it("prezzo_manuale null/0 → nessun effetto anche se subtotal è valorizzato", () => {
    const items = [mkItem({ id: "a", unit_price: 100, quantity: 1, prezzo_acquisto: 40 })];
    const r = computeBreakdown(items, [], [], {}, { prezzo_manuale: null, subtotal: 999, discount_amount: 0 });
    expect(r.totale_vendita).toBe(100);
    expect(r.prezzo_manuale_attivo).toBe(false);
  });
});
