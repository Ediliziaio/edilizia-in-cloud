/**
 * Preventivatore Serramentisti — Smoke test end-to-end (integrazione pure-logic).
 *
 * Scopo: verificare in un singolo test l'intera pipeline di calcolo che una
 * riga wizard attraversa, con dati realistici di un serramentista italiano:
 *
 *   1. Matrice listino (size-grid) importata da fornitore
 *   2. Ricarico aziendale applicato al listino (costo → vendita)
 *   3. nearestGrid per misura fuori griglia
 *   4. Assi di configurazione (apertura / vetro / ferramenta)
 *   5. Totali preventivo (subtotale + IVA + totale)
 *   6. Margine lordo atteso con overhead + provvigione commerciale
 *
 * Non tocca Supabase: esercita solo le funzioni pure usate da:
 *   - QuoteBuilder.tsx (line items + totali)
 *   - MargineAttesoPanel.tsx (FASE 11)
 *
 * Dati d'esempio realistici (fornitore Schüco-like, linea AWS 75):
 *   - Finestra 1200×1400 mm, 2 ante, vetro triplo, RC2, apertura battente
 *   - 3 pezzi, sconto riga 10%
 *   - Posa forfait 300€/cad, costo interno posatore 150€
 *   - Trasporto 120€ unico, costo 80€
 *   - Sconto globale preventivo 5%
 *   - Overhead aziendale 8%, provvigione commerciale 4%
 */

import { describe, it, expect } from "vitest";
import {
  calcolaTotaliPreventivo,
  calcolaMargineAtteso,
  round2,
  type MargineAttesoInput,
} from "@/hooks/usePreventivoCosti";
import {
  calcolaPrezzoFamiglia,
  nearestGrid,
  type GridPoint,
} from "@/hooks/useFamilyPricing";
import type {
  FamilyWithAxes,
  FamilyAxis,
  AxisValue,
  MaggiorazioneTipo,
} from "@/types/articleFamily";

/** Il listino fornitore col ricarico dell'azienda: vendita = acquisto × (1 + ricarico). */
function conRicarico(punti: GridPoint[], ricarico: number): GridPoint[] {
  return punti.map((p) => ({
    ...p,
    prezzo_vendita:
      p.prezzo_acquisto_netto != null && p.prezzo_acquisto_netto > 0
        ? round2(p.prezzo_acquisto_netto * (1 + ricarico))
        : p.prezzo_vendita,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
//   FACTORY HELPERS (riuso pattern familyPricing.test.ts)
// ═══════════════════════════════════════════════════════════════════════════

function makeValue(overrides: Partial<AxisValue> = {}): AxisValue {
  return {
    id: overrides.id ?? "val-" + Math.random().toString(36).slice(2, 8),
    axis_id: "axis-x",
    company_id: "co-x",
    valore: "v",
    label: "V",
    descrizione: null,
    is_default: false,
    maggiorazione_tipo: "none" as MaggiorazioneTipo,
    maggiorazione_valore: 0,
    maggiorazione_acquisto: 0,
    sort_order: 0,
    attivo: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeAxis(
  overrides: Partial<FamilyAxis> & { values?: AxisValue[] } = {},
): FamilyAxis & { values: AxisValue[] } {
  const { values, ...axisRest } = overrides;
  return {
    id: overrides.id ?? "axis-" + Math.random().toString(36).slice(2, 8),
    family_id: "fam-x",
    company_id: "co-x",
    nome: "Asse",
    codice: "asse",
    descrizione: null,
    tipo: "discrete",
    obbligatorio: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...axisRest,
    values: values ?? [],
  };
}

function makeFamily(overrides: Partial<FamilyWithAxes> = {}): FamilyWithAxes {
  return {
    id: "fam-finestra-2ante",
    company_id: "co-serramentista-test",
    vertical: "serramentista",
    categoria_id: null,
    nome: "Finestra PVC 2 ante",
    descrizione: "Finestra PVC con telaio multicamera, vetrocamera",
    immagine_url: null,
    pdf_scheda_url: null,
    modalita_prezzo_base: "griglia",
    prezzo_base_vendita: 0,
    prezzo_base_acquisto: 0,
    vat_rate: 22,
    unit_of_measure: "pz",
    posa_tariffa_default_id: null,
    posa_quantita_default: 0,
    griglia_asse_x_label: "Larghezza",
    griglia_asse_y_label: "Altezza",
    griglia_unita: "mm",
    attivo: true,
    sort_order: 1,
    custom_field_values: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    axes: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//   FIXTURE: Matrice listino fornitore (netto già scontato)
//   Scenario: azienda compra dal fornitore con sconto 55%, poi ricarica 100%
// ═══════════════════════════════════════════════════════════════════════════

const matriceFornitore: GridPoint[] = [
  { valore_x: 800,  valore_y: 1000, prezzo_vendita: 400, prezzo_acquisto_netto: 180, supplier_catalog_id: "sup-awsa", supplier_product_line_id: "line-aws75" },
  { valore_x: 800,  valore_y: 1400, prezzo_vendita: 480, prezzo_acquisto_netto: 216, supplier_catalog_id: "sup-awsa", supplier_product_line_id: "line-aws75" },
  { valore_x: 1200, valore_y: 1000, prezzo_vendita: 530, prezzo_acquisto_netto: 239, supplier_catalog_id: "sup-awsa", supplier_product_line_id: "line-aws75" },
  { valore_x: 1200, valore_y: 1400, prezzo_vendita: 710, prezzo_acquisto_netto: 320, supplier_catalog_id: "sup-awsa", supplier_product_line_id: "line-aws75" },
  { valore_x: 1600, valore_y: 1400, prezzo_vendita: 930, prezzo_acquisto_netto: 419, supplier_catalog_id: "sup-awsa", supplier_product_line_id: "line-aws75" },
];

// ═══════════════════════════════════════════════════════════════════════════
//   TEST 1 — Applicazione ricarico 100% al listino fornitore
// ═══════════════════════════════════════════════════════════════════════════

describe("Serramentisti E2E — pipeline completa", () => {
  it("applica ricarico 100% → pv = pa × 2 (1200×1400: 320 → 640)", () => {
    const adjusted = conRicarico(matriceFornitore, 1.0);
    const p = adjusted.find((g) => g.valore_x === 1200 && g.valore_y === 1400)!;
    expect(p.prezzo_vendita).toBe(640);
    expect(p.prezzo_acquisto_netto).toBe(320);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //   TEST 2 — nearestGrid su misura fuori griglia (Manhattan)
  // ═══════════════════════════════════════════════════════════════════════════

  it("nearestGrid su 1250×1420 → usa 1200×1400 (Manhattan)", () => {
    const adjusted = conRicarico(matriceFornitore, 1.0);
    const r = nearestGrid(adjusted, 1250, 1420);
    expect(r.found).toBe(false);
    expect(r.pv).toBe(640);
    expect(r.pa).toBe(320);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //   TEST 3 — Prezzo famiglia completo (matrice + 3 assi + quantità)
  //      base grid = 640 (1200×1400 dopo ricarico 100%)
  //      + 15% vetro triplo → 736
  //      + 10% apertura a-r → 809.60
  //      + 80€ RC2 (fisso_pz) → 889.60 / pezzo
  //      × 3 pezzi → 2668.80
  // ═══════════════════════════════════════════════════════════════════════════

  it("calcola prezzo riga finestra triplo anta-ribalta RC2 1200×1400 × 3pz", () => {
    const vetro = makeAxis({
      id: "ax-vetro",
      nome: "Vetro",
      codice: "vetro",
      sort_order: 1,
      values: [
        makeValue({ id: "v-doppio", valore: "doppio",
          maggiorazione_tipo: "none", maggiorazione_valore: 0, maggiorazione_acquisto: 0 }),
        makeValue({ id: "v-triplo", valore: "triplo",
          maggiorazione_tipo: "percentuale", maggiorazione_valore: 15, maggiorazione_acquisto: 15 }),
      ],
    });
    const apertura = makeAxis({
      id: "ax-apertura",
      nome: "Apertura",
      codice: "apertura",
      sort_order: 2,
      values: [
        makeValue({ id: "v-batt", valore: "battente",
          maggiorazione_tipo: "none", maggiorazione_valore: 0, maggiorazione_acquisto: 0 }),
        makeValue({ id: "v-ar", valore: "anta-ribalta",
          maggiorazione_tipo: "percentuale", maggiorazione_valore: 10, maggiorazione_acquisto: 10 }),
      ],
    });
    const sicurezza = makeAxis({
      id: "ax-sicurezza",
      nome: "Sicurezza",
      codice: "sicurezza",
      sort_order: 3,
      values: [
        makeValue({ id: "v-std", valore: "standard",
          maggiorazione_tipo: "none", maggiorazione_valore: 0, maggiorazione_acquisto: 0 }),
        makeValue({ id: "v-rc2", valore: "rc2",
          maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 80, maggiorazione_acquisto: 40 }),
      ],
    });

    const family = makeFamily({
      modalita_prezzo_base: "griglia",
      axes: [vetro, apertura, sicurezza],
    });

    const griglia = conRicarico(matriceFornitore, 1.0);

    const r = calcolaPrezzoFamiglia(
      {
        family,
        selections: {
          vetro: "v-triplo",
          apertura: "v-ar",
          sicurezza: "v-rc2",
        },
        larghezza_mm: 1200,
        altezza_mm: 1400,
        quantita: 3,
      },
      griglia,
    );

    expect(r.prezzo_griglia_base).toBe(640);
    expect(r.unit_price_vendita).toBe(889.6);
    expect(r.totale_vendita).toBe(2668.8);
    expect(r.maggiorazioni_applicate).toHaveLength(3);
    expect(r.warnings).toEqual([]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //   TEST 4 — Preventivo totale con 3 righe (finestre + posa + trasporto)
  // ═══════════════════════════════════════════════════════════════════════════

  it("calcola totale preventivo 3 righe con sconto globale 5% e overhead 8%", () => {
    const items = [
      // Finestra triplo anta-ribalta RC2 × 3 pezzi, sconto riga 10%
      {
        quantity: 3,
        unit_price: 889.6,
        discount_percent: 10,
        vat_rate: 22,
        prezzo_acquisto: 400, // acquisto base 320 + RC2 40 + altre magg. (ipotetico totale)
        is_optional: false,
        item_category: "prodotto",
      },
      // Posa forfait 300€ × 3, costo posatore 150€
      {
        quantity: 3,
        unit_price: 300,
        discount_percent: 0,
        vat_rate: 22,
        prezzo_acquisto: 150,
        is_optional: false,
        item_category: "posa",
      },
      // Trasporto unico
      {
        quantity: 1,
        unit_price: 120,
        discount_percent: 0,
        vat_rate: 22,
        prezzo_acquisto: 80,
        is_optional: false,
        item_category: "trasporto",
      },
    ];

    const r = calcolaTotaliPreventivo(items, 8, 5);

    // Subtotale lordo
    //   finestra: 3 × 889.60 × 0.90 = 2401.92
    //   posa:     3 × 300           = 900
    //   trasporto: 120
    //   totale lordo = 3421.92
    expect(r.subtotale).toBe(3421.92);

    // Subtotale netto (sconto globale 5%)
    //   3421.92 × 0.95 = 3250.824 → round2 → 3250.82
    expect(r.subtotale_netto).toBe(3250.82);

    // Costo totale = 3×400 + 3×150 + 80 = 1730
    expect(r.costo_totale).toBe(1730);

    // Overhead 8% su costo = 138.40
    expect(r.overhead_totale).toBe(138.4);

    // Totale con IVA ~ 3966€
    expect(r.totale).toBeGreaterThan(3960);
    expect(r.totale).toBeLessThan(3970);

    // Margine totale > 42%
    expect(r.margine_totale_pct).toBeGreaterThan(42);
    expect(r.margine_totale_pct).toBeLessThan(43);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //   TEST 5 — Margine Atteso FASE 11 (overhead + provvigione)
  // ═══════════════════════════════════════════════════════════════════════════

  it("calcolo margine lordo atteso con provvigione commerciale 4%", () => {
    const items: MargineAttesoInput[] = [
      {
        quantity: 3,
        unit_price: 889.6,
        discount_percent: 10,
        prezzo_acquisto: 400,
        is_optional: false,
        item_category: "prodotto",
      },
      {
        quantity: 3,
        unit_price: 300,
        discount_percent: 0,
        prezzo_acquisto: 150,
        is_optional: false,
        item_category: "posa",
      },
      {
        quantity: 1,
        unit_price: 120,
        discount_percent: 0,
        prezzo_acquisto: 80,
        is_optional: false,
        item_category: "trasporto",
      },
    ];

    // overhead 8%, sconto globale 5%, provvigione 4%
    const r = calcolaMargineAtteso(items, 8, 5, 4);

    // Ricavo netto = 3250.82
    expect(r.ricavo_netto).toBe(3250.82);

    // Costi separati per categoria (usa nomi reali del breakdown)
    expect(r.costo_materiali).toBe(1200); // 3 × 400 (prodotto)
    expect(r.costo_manodopera).toBe(450); // 3 × 150 (posa)
    expect(r.costo_altri).toBe(80); // 1 × 80 (trasporto)
    expect(r.costo_totale).toBe(1730);

    // Overhead 8% su costo_totale
    expect(r.overhead_euro).toBe(round2(1730 * 0.08));

    // Provvigione 4% su ricavo_netto
    expect(r.provvigione_euro).toBe(round2(3250.82 * 0.04));

    // Margine lordo = ricavo - costo (senza overhead/provv)
    expect(r.margine_lordo_euro).toBe(round2(3250.82 - 1730));

    // Margine atteso = ricavo - costo - overhead - provvigione
    const expectedAtteso = round2(
      3250.82 - 1730 - r.overhead_euro - r.provvigione_euro,
    );
    expect(r.margine_atteso_euro).toBe(expectedAtteso);

    // Margine atteso % deve essere > 0 ma < margine lordo %
    expect(r.margine_atteso_pct).toBeGreaterThan(0);
    expect(r.margine_atteso_pct).toBeLessThan(r.margine_lordo_pct);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //   TEST 6 — Robustezza: input vuoti / null / edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  it("gestisce preventivo vuoto senza crash", () => {
    const r = calcolaTotaliPreventivo([], 8, 0);
    expect(r.subtotale).toBe(0);
    expect(r.totale).toBe(0);
    expect(r.margine_totale_pct).toBe(0);

    const m = calcolaMargineAtteso([], 8, 0, 4);
    expect(m.ricavo_netto).toBe(0);
    expect(m.margine_atteso_pct).toBe(0);
  });

  it("item opzionale NON entra nei totali", () => {
    const items = [
      {
        quantity: 1,
        unit_price: 1000,
        discount_percent: 0,
        vat_rate: 22,
        prezzo_acquisto: 500,
        is_optional: false,
        item_category: "prodotto",
      },
      {
        quantity: 1,
        unit_price: 5000,
        discount_percent: 0,
        vat_rate: 22,
        prezzo_acquisto: 2500,
        is_optional: true, // OPZIONALE — escluso dal totale
        item_category: "prodotto",
      },
    ];
    const r = calcolaTotaliPreventivo(items, 0, 0);
    expect(r.subtotale).toBe(1000);
    expect(r.costo_totale).toBe(500);
  });

  it("categoria nota/subtotale/sconto esclusa dal margine atteso", () => {
    const items: MargineAttesoInput[] = [
      {
        quantity: 1,
        unit_price: 1000,
        discount_percent: 0,
        prezzo_acquisto: 500,
        is_optional: false,
        item_category: "prodotto",
      },
      {
        quantity: 1,
        unit_price: 9999,
        discount_percent: 0,
        prezzo_acquisto: 0,
        is_optional: false,
        item_category: "nota",
      },
    ];
    const r = calcolaMargineAtteso(items, 0, 0, 0);
    expect(r.ricavo_netto).toBe(1000);
    expect(r.costo_totale).toBe(500);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //   TEST 7 — Guard contro input malformati (defensive programming)
  // ═══════════════════════════════════════════════════════════════════════════

  it("asse obbligatorio senza selezione produce warning ma non crasha", () => {
    const asse = makeAxis({
      id: "ax-req",
      codice: "colore",
      nome: "Colore",
      obbligatorio: true,
      values: [makeValue({ id: "v-1", valore: "bianco" })],
    });
    const family = makeFamily({ modalita_prezzo_base: "pz", prezzo_base_vendita: 100, axes: [asse] });
    const r = calcolaPrezzoFamiglia({
      family,
      selections: {},
      quantita: 1,
    });
    expect(r.warnings.some((w) => w.includes("obbligatorio"))).toBe(true);
    expect(r.unit_price_vendita).toBe(100); // base preservata
  });

  it("griglia vuota con modalità griglia → warning + prezzo 0 (no crash)", () => {
    const family = makeFamily({ modalita_prezzo_base: "griglia" });
    const r = calcolaPrezzoFamiglia(
      {
        family,
        selections: {},
        larghezza_mm: 1200,
        altezza_mm: 1400,
        quantita: 1,
      },
      [],
    );
    expect(r.unit_price_vendita).toBe(0);
    expect(r.warnings).toContain("Griglia prezzi vuota per questa famiglia");
  });
});
