/**
 * Il margine del preventivo è uno solo: ricavo NETTO dello sconto globale e senza
 * le righe opzionali (che non sono vendute), meno i costi delle righe vendute.
 *
 * Il builder lo calcolava così (calcolaTotaliPreventivo), ma la pagina «Margine &
 * Pianificazione» (computeBreakdown) e la scheda rapida del preventivo ne davano
 * un altro: sommavano le righe al lordo dello sconto globale — «Ricavo totale»
 * 10.000 € su un'offerta venduta a 9.000 — e contavano anche i costi e i ricavi
 * delle righe opzionali. Con un 10% di sconto il margine di una vendita a costo
 * 6.000 € usciva 40% invece del 33,3%.
 */
import { describe, expect, it } from "vitest";
import { computeBreakdown } from "@/hooks/useMargineBreakdown";
import { calcolaTotaliPreventivo } from "@/hooks/usePreventivoCosti";
import { ricavoNettoPreventivo } from "@/lib/preventivi/ricavoNetto";

const voce = (id: string, extra: Record<string, unknown> = {}) => ({
  id, quote_id: "q-1", item_type: "product", item_category: "prodotto", name: id, quantity: 1, unit_price: 0,
  discount_percent: 0, tariffa_id: null as string | null, prezzo_acquisto: 0, costo_unitario: null as number | null, is_optional: false, ...extra,
});

describe("margine: sconto globale e righe opzionali", () => {
  it("con lo sconto globale il ricavo è quello venduto: 10.000 − 10% = 9.000, margine 33,3% e non 40%", () => {
    const righe = [voce("a", { quantity: 2, unit_price: 5000, prezzo_acquisto: 3000 })];
    const r = computeBreakdown(righe, [], [], {}, { prezzo_manuale: null, subtotal: 10000, discount_amount: 1000, discount_percent: 10 });
    expect(r.totale_vendita).toBe(9000);
    expect(r.totale_costo).toBe(6000);
    expect(r.margine_totale_euro).toBe(3000);
    expect(r.margine_totale_pct).toBeCloseTo(33.3333, 3);
  });

  it("le righe opzionali non sono vendute: fuori da ricavo e costo, ma restano nell'elenco", () => {
    const righe = [
      voce("venduta", { unit_price: 1000, prezzo_acquisto: 600 }),
      voce("opzionale", { unit_price: 500, prezzo_acquisto: 400, is_optional: true }),
    ];
    const r = computeBreakdown(righe, [], [], {}, null);
    expect(r.righe).toHaveLength(2);
    expect(r.totale_vendita).toBe(1000);
    expect(r.totale_costo).toBe(600);
    expect(r.margine_totale_pct).toBeCloseTo(40, 6);
  });

  it("senza sconto e senza opzionali il conto è quello di sempre", () => {
    const righe = [voce("a", { unit_price: 100, quantity: 2, prezzo_acquisto: 60 }), voce("b", { unit_price: 50, prezzo_acquisto: 20 })];
    const r = computeBreakdown(righe, [], [], {});
    expect(r.totale_vendita).toBe(250);
    expect(r.margine_totale_pct).toBeCloseTo(44, 6);
  });

  it("col prezzo scritto a mano resta il ricavo salvato (prezzo − sconto)", () => {
    const righe = [voce("a", { quantity: 3, prezzo_acquisto: 200 }), voce("b", { prezzo_acquisto: 150 })];
    const r = computeBreakdown(righe, [], [], {}, { prezzo_manuale: 5000, subtotal: 5000, discount_amount: 500, discount_percent: 10 });
    expect(r.totale_vendita).toBe(4500);
    expect(r.margine_totale_euro).toBe(3750);
  });

  it("tre viste, stesso margine: builder, pagina Margine e scheda rapida", () => {
    // Prodotti con costo, uno sconto di riga, uno globale del 7,5% e una riga opzionale.
    const righe = [
      { quantity: 3, unit_price: 1234.56, discount_percent: 5, prezzo_acquisto: 700, vat_rate: 22 },
      { quantity: 1, unit_price: 480, discount_percent: 0, prezzo_acquisto: 250, vat_rate: 22 },
      { quantity: 2, unit_price: 90, discount_percent: 0, prezzo_acquisto: 55, vat_rate: 22, is_optional: true },
    ];
    const sconto = 7.5;
    const builder = calcolaTotaliPreventivo(righe.map((x) => ({ ...x, item_category: "prodotto" })), 0, sconto);
    const pagina = computeBreakdown(
      righe.map((x, i) => voce(`r${i}`, x)), [], [], {},
      { prezzo_manuale: null, subtotal: builder.subtotale, discount_amount: builder.subtotale - builder.subtotale_netto, discount_percent: sconto },
    );
    expect(pagina.totale_vendita).toBeCloseTo(builder.subtotale_netto, 2);
    expect(pagina.totale_costo).toBeCloseTo(builder.costo_totale, 2);
    expect(pagina.margine_totale_pct).toBeCloseTo(builder.margine_totale_pct, 1);
    // La scheda rapida usa lo stesso conto del ricavo.
    const scheda = ricavoNettoPreventivo({ prezzoManualeAttivo: false, subtotal: builder.subtotale, discount_amount: builder.subtotale - builder.subtotale_netto, discount_percent: sconto, sommaRighe: builder.subtotale });
    expect(scheda).toBeCloseTo(builder.subtotale_netto, 2);
  });
});

describe("ricavoNettoPreventivo", () => {
  it("senza prezzo a mano: somma delle righe vendute meno lo sconto globale, al centesimo", () => {
    expect(ricavoNettoPreventivo({ prezzoManualeAttivo: false, subtotal: 10000, discount_amount: 1000, discount_percent: 10, sommaRighe: 10000 })).toBe(9000);
    expect(ricavoNettoPreventivo({ prezzoManualeAttivo: false, subtotal: 0, discount_amount: 0, discount_percent: 12.5, sommaRighe: 333.33 })).toBe(291.66);
    expect(ricavoNettoPreventivo({ prezzoManualeAttivo: false, subtotal: 0, discount_amount: 0, discount_percent: null, sommaRighe: 500 })).toBe(500);
  });

  it("con il prezzo a mano: quello salvato, meno lo sconto salvato", () => {
    expect(ricavoNettoPreventivo({ prezzoManualeAttivo: true, subtotal: 5000, discount_amount: 500, discount_percent: 10, sommaRighe: 0 })).toBe(4500);
  });

  it("valori rotti: mai NaN", () => {
    expect(ricavoNettoPreventivo({ prezzoManualeAttivo: false, subtotal: null, discount_amount: null, discount_percent: Number.NaN, sommaRighe: 100 })).toBe(100);
    expect(ricavoNettoPreventivo({ prezzoManualeAttivo: true, subtotal: null, discount_amount: undefined, discount_percent: 0, sommaRighe: 0 })).toBe(0);
  });
});
