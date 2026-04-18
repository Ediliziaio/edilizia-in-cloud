import { describe, it, expect } from "vitest";
import {
  calcolaMargineAtteso,
  type MargineAttesoInput,
} from "@/hooks/usePreventivoCosti";

/**
 * Preventivatore Serramentisti FASE 11 — test per calcolaMargineAtteso.
 *
 * Formula di riferimento:
 *   ricavo_netto = Σ (qty × pv × (1 − sconto_riga)) × (1 − sconto_globale)
 *   costo_totale = Σ (qty × prezzo_acquisto)   [separato per categoria]
 *   overhead     = costo_totale × overhead_pct/100
 *   provvigione  = ricavo_netto × commission_pct/100
 *   margine_lordo  = ricavo_netto − costo_totale
 *   margine_atteso = ricavo_netto − costo_totale − overhead − provvigione
 *
 * IVA è SEMPRE fuori dal calcolo (passthrough).
 */

// Helper per costruire un item tipico
const mkItem = (over: Partial<MargineAttesoInput> = {}): MargineAttesoInput => ({
  quantity: 1,
  unit_price: 0,
  discount_percent: 0,
  prezzo_acquisto: 0,
  is_optional: false,
  item_category: "prodotto",
  ...over,
});

describe("calcolaMargineAtteso — scenari base", () => {
  it("preventivo vuoto → tutto zero", () => {
    const r = calcolaMargineAtteso([], 0, 0, 0);
    expect(r.ricavo_netto).toBe(0);
    expect(r.costo_totale).toBe(0);
    expect(r.margine_lordo_euro).toBe(0);
    expect(r.margine_atteso_euro).toBe(0);
    expect(r.margine_lordo_pct).toBe(0);
    expect(r.margine_atteso_pct).toBe(0);
  });

  it("solo prodotto, no overhead/commission → margine = ricavo - costo", () => {
    const items = [
      mkItem({ quantity: 2, unit_price: 100, prezzo_acquisto: 60 }),
    ];
    const r = calcolaMargineAtteso(items, 0, 0, 0);
    expect(r.ricavo_netto).toBe(200);
    expect(r.costo_materiali).toBe(120);
    expect(r.costo_manodopera).toBe(0);
    expect(r.costo_totale).toBe(120);
    expect(r.margine_lordo_euro).toBe(80);
    expect(r.margine_lordo_pct).toBe(40);
    expect(r.margine_atteso_euro).toBe(80);
    expect(r.margine_atteso_pct).toBe(40);
  });

  it("separa costo materiali vs manodopera vs altri", () => {
    const items: MargineAttesoInput[] = [
      mkItem({ unit_price: 1000, prezzo_acquisto: 600, item_category: "prodotto" }),
      mkItem({ unit_price: 200, prezzo_acquisto: 150, item_category: "posa" }),
      mkItem({ unit_price: 80, prezzo_acquisto: 40, item_category: "trasporto" }),
      mkItem({ unit_price: 50, prezzo_acquisto: 30, item_category: "smaltimento" }),
      mkItem({ unit_price: 20, prezzo_acquisto: 10, item_category: "nolo" }),
    ];
    const r = calcolaMargineAtteso(items, 0, 0, 0);
    expect(r.costo_materiali).toBe(600);
    expect(r.costo_manodopera).toBe(150);
    expect(r.costo_altri).toBe(80); // trasporto+smaltimento+nolo = 40+30+10
    expect(r.costo_totale).toBe(830);
    expect(r.ricavo_netto).toBe(1350); // 1000+200+80+50+20
    expect(r.margine_lordo_euro).toBe(520);
  });

  it("applica overhead sul costo_totale", () => {
    // ricavo=1000, costo=500, overhead 10% su 500 = 50, margine_atteso = 1000-500-50 = 450
    const items = [
      mkItem({ unit_price: 1000, prezzo_acquisto: 500 }),
    ];
    const r = calcolaMargineAtteso(items, 10, 0, 0);
    expect(r.overhead_euro).toBe(50);
    expect(r.margine_lordo_euro).toBe(500); // lordo ignora overhead/provvigione
    expect(r.margine_atteso_euro).toBe(450);
    expect(r.margine_atteso_pct).toBe(45);
  });

  it("applica provvigione commerciale sul ricavo_netto", () => {
    // ricavo=1000, costo=500, provvigione 5% su 1000 = 50, margine_atteso = 1000-500-50 = 450
    const items = [
      mkItem({ unit_price: 1000, prezzo_acquisto: 500 }),
    ];
    const r = calcolaMargineAtteso(items, 0, 0, 5);
    expect(r.provvigione_euro).toBe(50);
    expect(r.margine_lordo_euro).toBe(500);
    expect(r.margine_atteso_euro).toBe(450);
  });

  it("overhead + provvigione insieme (sottratti entrambi)", () => {
    // ricavo=1000, costo=500, overhead 10% (50), provvigione 5% (50) → margine 400
    const items = [
      mkItem({ unit_price: 1000, prezzo_acquisto: 500 }),
    ];
    const r = calcolaMargineAtteso(items, 10, 0, 5);
    expect(r.overhead_euro).toBe(50);
    expect(r.provvigione_euro).toBe(50);
    expect(r.margine_atteso_euro).toBe(400);
    expect(r.margine_atteso_pct).toBe(40);
  });
});

describe("calcolaMargineAtteso — sconti", () => {
  it("sconto di riga riduce ricavo ma NON costo", () => {
    // qty=1, pv=100, sconto riga 20% → ricavo 80; costo 50 → margine 30
    const items = [
      mkItem({ unit_price: 100, prezzo_acquisto: 50, discount_percent: 20 }),
    ];
    const r = calcolaMargineAtteso(items, 0, 0, 0);
    expect(r.ricavo_netto).toBe(80);
    expect(r.costo_totale).toBe(50);
    expect(r.margine_lordo_euro).toBe(30);
  });

  it("sconto globale preventivo riduce ricavo ma NON costo", () => {
    // pv=100, costo=50. Sconto globale 10% → ricavo 90, margine 40
    const items = [
      mkItem({ unit_price: 100, prezzo_acquisto: 50 }),
    ];
    const r = calcolaMargineAtteso(items, 0, 10, 0);
    expect(r.ricavo_netto).toBe(90);
    expect(r.costo_totale).toBe(50);
    expect(r.margine_lordo_euro).toBe(40);
  });

  it("sconto riga + sconto globale si combinano moltiplicativamente", () => {
    // pv=100, sconto riga 10% → imponibile 90, × (1-0.1) globale → ricavo 81
    const items = [
      mkItem({ unit_price: 100, prezzo_acquisto: 50, discount_percent: 10 }),
    ];
    const r = calcolaMargineAtteso(items, 0, 10, 0);
    expect(r.ricavo_netto).toBe(81);
    expect(r.margine_lordo_euro).toBe(31);
  });
});

describe("calcolaMargineAtteso — filtri items", () => {
  it("esclude item is_optional=true", () => {
    const items = [
      mkItem({ unit_price: 1000, prezzo_acquisto: 500 }),
      mkItem({ unit_price: 9999, prezzo_acquisto: 1, is_optional: true }),
    ];
    const r = calcolaMargineAtteso(items, 0, 0, 0);
    expect(r.ricavo_netto).toBe(1000);
    expect(r.costo_totale).toBe(500);
  });

  it("esclude item_category=nota/subtotale/sconto", () => {
    const items: MargineAttesoInput[] = [
      mkItem({ unit_price: 1000, prezzo_acquisto: 500 }),
      mkItem({ unit_price: 0, prezzo_acquisto: 0, item_category: "nota" }),
      mkItem({ unit_price: 500, prezzo_acquisto: 300, item_category: "subtotale" }),
      mkItem({ unit_price: -100, prezzo_acquisto: 0, item_category: "sconto" }),
    ];
    const r = calcolaMargineAtteso(items, 0, 0, 0);
    expect(r.ricavo_netto).toBe(1000);
    expect(r.costo_totale).toBe(500);
  });
});

describe("calcolaMargineAtteso — casi limite", () => {
  it("ricavo zero → percentuali zero (no division-by-zero)", () => {
    const items = [
      mkItem({ unit_price: 0, prezzo_acquisto: 50 }),
    ];
    const r = calcolaMargineAtteso(items, 0, 0, 0);
    expect(r.ricavo_netto).toBe(0);
    expect(r.margine_lordo_pct).toBe(0);
    expect(r.margine_atteso_pct).toBe(0);
    expect(r.margine_lordo_euro).toBe(-50); // perdita in €
  });

  it("margine negativo: costo > ricavo", () => {
    const items = [
      mkItem({ unit_price: 100, prezzo_acquisto: 150 }),
    ];
    const r = calcolaMargineAtteso(items, 0, 0, 0);
    expect(r.margine_lordo_euro).toBe(-50);
    expect(r.margine_lordo_pct).toBe(-50);
  });

  it("valori non numerici o null sanificati", () => {
    // overhead negativo diventa 0, commission negativa diventa 0
    const items = [
      mkItem({ unit_price: 100, prezzo_acquisto: 50 }),
    ];
    const r = calcolaMargineAtteso(items, -10, 0, -5);
    expect(r.overhead_euro).toBe(0);
    expect(r.provvigione_euro).toBe(0);
    expect(r.margine_atteso_euro).toBe(50);
  });

  it("sconto globale fuori range viene clampato", () => {
    // sconto 150% → clampato a 100% → ricavo 0
    const items = [
      mkItem({ unit_price: 100, prezzo_acquisto: 50 }),
    ];
    const r = calcolaMargineAtteso(items, 0, 150, 0);
    expect(r.ricavo_netto).toBe(0);
  });

  it("scenario realistico serramentista (listino 100 × sconto 55% × ricarico 100%)", () => {
    // Serramento: listino 100 × (1-0.55) = acquisto 45 × (1+1.0) = vendita 90
    // Preventivo: 10 pezzi
    //   ricavo = 10 × 90 = 900
    //   costo  = 10 × 45 = 450
    //   overhead 5% su 450 = 22.5
    //   provvigione 3% su 900 = 27
    //   margine atteso = 900 - 450 - 22.5 - 27 = 400.5
    //   margine atteso % = 400.5 / 900 = 44.5%
    const items = [
      mkItem({
        quantity: 10,
        unit_price: 90,
        prezzo_acquisto: 45,
        item_category: "prodotto",
      }),
    ];
    const r = calcolaMargineAtteso(items, 5, 0, 3);
    expect(r.ricavo_netto).toBe(900);
    expect(r.costo_materiali).toBe(450);
    expect(r.overhead_euro).toBe(22.5);
    expect(r.provvigione_euro).toBe(27);
    expect(r.margine_atteso_euro).toBe(400.5);
    expect(r.margine_atteso_pct).toBe(44.5);
  });

  it("scenario misto serramento + posa + trasporto con provvigione", () => {
    // 3 finestre: 3×300 = 900 ricavo, 3×180 = 540 costo
    // Posa forfettaria: 200, costo interno posatore 120
    // Trasporto: 50, costo 30
    // ricavo totale = 1150
    // costo totale = 540 + 120 + 30 = 690
    // overhead 0, provvigione 5% su 1150 = 57.5
    // margine atteso = 1150 - 690 - 57.5 = 402.5
    const items: MargineAttesoInput[] = [
      mkItem({ quantity: 3, unit_price: 300, prezzo_acquisto: 180, item_category: "prodotto" }),
      mkItem({ quantity: 1, unit_price: 200, prezzo_acquisto: 120, item_category: "posa" }),
      mkItem({ quantity: 1, unit_price: 50, prezzo_acquisto: 30, item_category: "trasporto" }),
    ];
    const r = calcolaMargineAtteso(items, 0, 0, 5);
    expect(r.ricavo_netto).toBe(1150);
    expect(r.costo_materiali).toBe(540);
    expect(r.costo_manodopera).toBe(120);
    expect(r.costo_altri).toBe(30);
    expect(r.provvigione_euro).toBe(57.5);
    expect(r.margine_atteso_euro).toBe(402.5);
  });
});

describe("calcolaMargineAtteso — purità", () => {
  it("non muta gli input", () => {
    const items = [
      mkItem({ unit_price: 100, prezzo_acquisto: 50, discount_percent: 10 }),
    ];
    const snapshot = JSON.parse(JSON.stringify(items));
    calcolaMargineAtteso(items, 5, 5, 3);
    expect(items).toEqual(snapshot);
  });

  it("deterministica: stessi input → stesso output", () => {
    const items = [
      mkItem({ quantity: 2, unit_price: 150, prezzo_acquisto: 80 }),
      mkItem({ quantity: 1, unit_price: 50, prezzo_acquisto: 20, item_category: "posa" }),
    ];
    const r1 = calcolaMargineAtteso(items, 5, 2, 3);
    const r2 = calcolaMargineAtteso(items, 5, 2, 3);
    expect(r1).toEqual(r2);
  });
});
