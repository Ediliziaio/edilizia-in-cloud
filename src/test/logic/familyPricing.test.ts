import { describe, it, expect } from "vitest";
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

/**
 * Test motore calcolo prezzo famiglia — FASE 5.3 (masterprompt).
 * Copre i casi obbligatori elencati in 5.3:
 *  - pz senza assi → base × Q
 *  - mq con L×H
 *  - griglia exact match / nearest neighbor
 *  - mix percentuale + fisso_mq + fisso_pz
 *  - warning: griglia vuota, asse obbligatorio, asse opzionale
 */

// ─── Factory helpers ───────────────────────────────────────────────────

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
    id: "fam-1",
    company_id: "co-x",
    vertical: "serramentisti",
    categoria_id: null,
    nome: "Finestra test",
    descrizione: null,
    immagine_url: null,
    pdf_scheda_url: null,
    modalita_prezzo_base: "pz",
    // Default mode="vendita" per retrocompat con test pre-migration
    // 20260421000002 (prezzo_base_mode). Le override possono bypassare.
    prezzo_base_mode: "vendita",
    prezzo_base_vendita: 100,
    prezzo_base_acquisto: 60,
    markup_tipo: "none",
    markup_valore: 0,
    sconto_fornitore_1: 0,
    sconto_fornitore_2: 0,
    vat_rate: 22,
    vat_rate_acquisto: 22,
    unit_of_measure: "pz",
    posa_tariffa_default_id: null,
    posa_quantita_default: 0,
    griglia_asse_x_label: "Larghezza",
    griglia_asse_y_label: "Altezza",
    griglia_unita: "mm",
    attivo: true,
    sort_order: 0,
    custom_field_values: {},
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    axes: [],
    ...overrides,
  };
}

// ─── Test cases ────────────────────────────────────────────────────────

describe("nearestGrid", () => {
  const punti: GridPoint[] = [
    {
      valore_x: 1000,
      valore_y: 1000,
      prezzo_vendita: 300,
      prezzo_acquisto_netto: 180,
    },
    {
      valore_x: 1200,
      valore_y: 1400,
      prezzo_vendita: 420,
      prezzo_acquisto_netto: 250,
    },
    {
      valore_x: 1500,
      valore_y: 1800,
      prezzo_vendita: 600,
      prezzo_acquisto_netto: 350,
    },
  ];

  it("ritorna {0,0,false} se la lista è vuota", () => {
    expect(nearestGrid([], 100, 100)).toEqual({
      pv: 0,
      pa: 0,
      found: false,
    });
  });

  it("trova match esatto con found=true", () => {
    const r = nearestGrid(punti, 1200, 1400);
    expect(r.found).toBe(true);
    expect(r.pv).toBe(420);
    expect(r.pa).toBe(250);
  });

  it("nearest-neighbor Manhattan quando non c'è match esatto", () => {
    // 1250×1420 più vicino a 1200×1400 (distanza 50+20=70)
    const r = nearestGrid(punti, 1250, 1420);
    expect(r.found).toBe(false);
    expect(r.pv).toBe(420);
  });

  it("tratta prezzo_acquisto_netto null come 0", () => {
    const r = nearestGrid(
      [
        {
          valore_x: 1000,
          valore_y: 1000,
          prezzo_vendita: 300,
          prezzo_acquisto_netto: null,
        },
      ],
      1000,
      1000,
    );
    expect(r.pa).toBe(0);
  });
});

describe("calcolaPrezzoFamiglia — casi base", () => {
  it("pz senza assi, base 100 × Q=3 → totale 300", () => {
    const family = makeFamily({
      modalita_prezzo_base: "pz",
      prezzo_base_vendita: 100,
      prezzo_base_acquisto: 60,
    });
    const r = calcolaPrezzoFamiglia({
      family,
      selections: {},
      quantita: 3,
    });
    expect(r.unit_price_vendita).toBe(100);
    expect(r.totale_vendita).toBe(300);
    expect(r.totale_acquisto).toBe(180);
    expect(r.warnings).toEqual([]);
    expect(r.mq).toBeNull();
  });

  it("mq 1.2×1.4 con €200/mq, Q=1 → 336", () => {
    const family = makeFamily({
      modalita_prezzo_base: "mq",
      prezzo_base_vendita: 200,
      prezzo_base_acquisto: 120,
    });
    const r = calcolaPrezzoFamiglia({
      family,
      selections: {},
      larghezza_mm: 1200,
      altezza_mm: 1400,
      quantita: 1,
    });
    expect(r.mq).toBe(1.68);
    expect(r.unit_price_vendita).toBe(336);
    expect(r.totale_vendita).toBe(336);
  });

  it("mq senza misure produce warning", () => {
    const family = makeFamily({ modalita_prezzo_base: "mq" });
    const r = calcolaPrezzoFamiglia({
      family,
      selections: {},
      quantita: 1,
    });
    expect(r.warnings).toContain("Misure L×H mancanti per famiglia mq");
    expect(r.unit_price_vendita).toBe(0);
  });
});

describe("calcolaPrezzoFamiglia — griglia", () => {
  const griglia: GridPoint[] = [
    {
      valore_x: 1000,
      valore_y: 1200,
      prezzo_vendita: 350,
      prezzo_acquisto_netto: 200,
    },
    {
      valore_x: 1200,
      valore_y: 1400,
      prezzo_vendita: 420,
      prezzo_acquisto_netto: 250,
    },
    {
      valore_x: 1500,
      valore_y: 1800,
      prezzo_vendita: 600,
      prezzo_acquisto_netto: 350,
    },
  ];

  it("exact match 1200×1400 @ 420€, no assi, Q=1 → 420", () => {
    const family = makeFamily({ modalita_prezzo_base: "griglia" });
    const r = calcolaPrezzoFamiglia(
      {
        family,
        selections: {},
        larghezza_mm: 1200,
        altezza_mm: 1400,
        quantita: 1,
      },
      griglia,
    );
    expect(r.prezzo_griglia_base).toBe(420);
    expect(r.unit_price_vendita).toBe(420);
    expect(r.totale_vendita).toBe(420);
    expect(r.warnings).toEqual([]);
  });

  it("nearest neighbor 1250×1420 → usa 1200×1400 = 420 + warning", () => {
    const family = makeFamily({ modalita_prezzo_base: "griglia" });
    const r = calcolaPrezzoFamiglia(
      {
        family,
        selections: {},
        larghezza_mm: 1250,
        altezza_mm: 1420,
        quantita: 1,
      },
      griglia,
    );
    expect(r.unit_price_vendita).toBe(420);
    expect(r.warnings.some((w) => w.includes("più vicina"))).toBe(true);
  });

  it("griglia vuota → warning, prezzo 0", () => {
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
    expect(r.warnings).toContain(
      "Griglia prezzi vuota per questa famiglia",
    );
  });

  it("griglia + 15% apertura + 40€/mq vetro + 80€/pz ferramenta su 1200×1400 → 630.20", () => {
    // base 420 × 1.15 = 483, + 40×1.68 = 67.2, + 80 = 630.20
    const apertura = makeAxis({
      id: "ax-apertura",
      nome: "Apertura",
      codice: "apertura",
      sort_order: 0,
      values: [
        makeValue({
          id: "v-ap-doppia",
          valore: "doppia",
          maggiorazione_tipo: "percentuale",
          maggiorazione_valore: 15,
          maggiorazione_acquisto: 15,
        }),
      ],
    });
    const vetro = makeAxis({
      id: "ax-vetro",
      nome: "Vetro",
      codice: "vetro",
      sort_order: 1,
      values: [
        makeValue({
          id: "v-vetro-premium",
          valore: "premium",
          maggiorazione_tipo: "fisso_mq",
          maggiorazione_valore: 40,
          maggiorazione_acquisto: 20,
        }),
      ],
    });
    const ferramenta = makeAxis({
      id: "ax-ferramenta",
      nome: "Ferramenta",
      codice: "ferramenta",
      sort_order: 2,
      values: [
        makeValue({
          id: "v-ferr-high",
          valore: "high",
          maggiorazione_tipo: "fisso_pz",
          maggiorazione_valore: 80,
          maggiorazione_acquisto: 40,
        }),
      ],
    });
    const family = makeFamily({
      modalita_prezzo_base: "griglia",
      axes: [apertura, vetro, ferramenta],
    });
    const r = calcolaPrezzoFamiglia(
      {
        family,
        selections: {
          apertura: "v-ap-doppia",
          vetro: "v-vetro-premium",
          ferramenta: "v-ferr-high",
        },
        larghezza_mm: 1200,
        altezza_mm: 1400,
        quantita: 1,
      },
      griglia,
    );
    expect(r.unit_price_vendita).toBe(630.2);
    expect(r.totale_vendita).toBe(630.2);
    expect(r.maggiorazioni_applicate).toHaveLength(3);
    // Percentuale applicata per prima
    expect(r.maggiorazioni_applicate[0].tipo).toBe("percentuale");
  });
});

describe("calcolaPrezzoFamiglia — validation warnings", () => {
  it("asse obbligatorio senza selezione produce warning", () => {
    const axis = makeAxis({
      id: "ax-req",
      codice: "colore",
      nome: "Colore",
      obbligatorio: true,
      values: [
        makeValue({ id: "v-rosso", valore: "rosso" }),
      ],
    });
    const family = makeFamily({ axes: [axis] });
    const r = calcolaPrezzoFamiglia({
      family,
      selections: {},
      quantita: 1,
    });
    expect(r.warnings.some((w) => w.includes("Colore") && w.includes("obbligatorio"))).toBe(true);
  });

  it("asse opzionale senza selezione NON produce warning né maggiorazioni", () => {
    const axis = makeAxis({
      id: "ax-opt",
      codice: "colore",
      nome: "Colore",
      obbligatorio: false,
      values: [
        makeValue({
          id: "v-rosso",
          valore: "rosso",
          maggiorazione_tipo: "fisso_pz",
          maggiorazione_valore: 50,
        }),
      ],
    });
    const family = makeFamily({ axes: [axis] });
    const r = calcolaPrezzoFamiglia({
      family,
      selections: {},
      quantita: 1,
    });
    expect(r.warnings).toEqual([]);
    expect(r.maggiorazioni_applicate).toEqual([]);
    expect(r.unit_price_vendita).toBe(100);
  });

  it("fisso_ml senza lunghezza_ml produce warning e salta il delta", () => {
    const axis = makeAxis({
      id: "ax-ml",
      codice: "lungh",
      nome: "Lunghezza",
      values: [
        makeValue({
          id: "v-ml",
          valore: "standard",
          maggiorazione_tipo: "fisso_ml",
          maggiorazione_valore: 10,
        }),
      ],
    });
    const family = makeFamily({ axes: [axis] });
    const r = calcolaPrezzoFamiglia({
      family,
      selections: { lungh: "v-ml" },
      quantita: 1,
    });
    expect(r.warnings.some((w) => w.includes("ml non calcolabile"))).toBe(true);
    expect(r.unit_price_vendita).toBe(100); // niente delta
  });

  it("fisso_mc produce warning 'non ancora supportata'", () => {
    const axis = makeAxis({
      id: "ax-mc",
      codice: "vol",
      nome: "Volume",
      values: [
        makeValue({
          id: "v-mc",
          valore: "x",
          maggiorazione_tipo: "fisso_mc",
          maggiorazione_valore: 5,
        }),
      ],
    });
    const family = makeFamily({ axes: [axis] });
    const r = calcolaPrezzoFamiglia({
      family,
      selections: { vol: "v-mc" },
      quantita: 1,
    });
    expect(r.warnings.some((w) => w.includes("mc non ancora supportata"))).toBe(true);
  });
});

describe("calcolaPrezzoFamiglia — sort_order assi", () => {
  it("le percentuali sono applicate nell'ordine sort_order, non di inserzione", () => {
    const axSecond = makeAxis({
      id: "ax-a",
      codice: "a",
      nome: "A",
      sort_order: 2,
      values: [
        makeValue({
          id: "v-a",
          maggiorazione_tipo: "percentuale",
          maggiorazione_valore: 10,
          maggiorazione_acquisto: 10,
        }),
      ],
    });
    const axFirst = makeAxis({
      id: "ax-b",
      codice: "b",
      nome: "B",
      sort_order: 1,
      values: [
        makeValue({
          id: "v-b",
          maggiorazione_tipo: "percentuale",
          maggiorazione_valore: 20,
          maggiorazione_acquisto: 20,
        }),
      ],
    });
    const family = makeFamily({
      prezzo_base_vendita: 100,
      axes: [axSecond, axFirst], // inseriti fuori ordine
    });
    const r = calcolaPrezzoFamiglia({
      family,
      selections: { a: "v-a", b: "v-b" },
      quantita: 1,
    });
    // 100 * 1.20 * 1.10 = 132 (commutativo, ma verifichiamo l'ordine)
    expect(r.unit_price_vendita).toBe(132);
    expect(r.maggiorazioni_applicate[0].axis_codice).toBe("b");
    expect(r.maggiorazioni_applicate[1].axis_codice).toBe("a");
  });
});

/**
 * Cascata sconti fornitore + markup applicata ON READ.
 *
 * Business case: famiglia "Finestra a Wasistas" in mode=acquisto_markup.
 *   - Grid cells hanno prezzo_acquisto = LORDO listino fornitore
 *   - Grid cells hanno prezzo_vendita = cache (potenzialmente stale)
 *   - Famiglia ha sconto_fornitore_1=50, sconto_fornitore_2=3, markup=100%
 *
 * calcolaPrezzoFamiglia deve ricalcolare vendita dal LORDO:
 *   lordo × (1-s1/100) × (1-s2/100) × (1+markup/100) = vendita
 *
 * Questo evita che un cambio di markup/sconti dalla famiglia richieda
 * di ri-salvare tutta la griglia per riflettersi nel preventivo.
 */
describe("calcolaPrezzoFamiglia — mode=acquisto_markup cascata", () => {
  it("griglia + sconti 50/3 + markup 100% → Finestra a Wasistas €1000 lordo → €970", () => {
    const family = makeFamily({
      modalita_prezzo_base: "griglia",
      prezzo_base_mode: "acquisto_markup",
      markup_tipo: "percentuale",
      markup_valore: 100,
      sconto_fornitore_1: 50,
      sconto_fornitore_2: 3,
    });
    const griglia: GridPoint[] = [
      {
        valore_x: 1200,
        valore_y: 1400,
        prezzo_vendita: 9999, // cache STALE (deliberatamente sbagliata)
        prezzo_acquisto_netto: 1000, // LORDO listino
      },
    ];
    const r = calcolaPrezzoFamiglia(
      {
        family,
        selections: {},
        larghezza_mm: 1200,
        altezza_mm: 1400,
        quantita: 1,
      },
      griglia,
    );
    // netto = 1000 × 0.5 × 0.97 = 485
    // vendita = 485 × 2 = 970
    expect(r.unit_price_acquisto).toBeCloseTo(485, 2);
    expect(r.unit_price_vendita).toBeCloseTo(970, 2);
    expect(r.totale_vendita).toBeCloseTo(970, 2);
    expect(r.totale_acquisto).toBeCloseTo(485, 2);
    // Margine corretto: vendita - netto (non vendita - lordo)
    const margine = r.totale_vendita - r.totale_acquisto;
    expect(margine).toBeCloseTo(485, 2);
  });

  it("mode=acquisto_markup con sconti 0/0 → NO cascata, markup diretto", () => {
    const family = makeFamily({
      modalita_prezzo_base: "griglia",
      prezzo_base_mode: "acquisto_markup",
      markup_tipo: "percentuale",
      markup_valore: 45,
      sconto_fornitore_1: 0,
      sconto_fornitore_2: 0,
    });
    const griglia: GridPoint[] = [
      {
        valore_x: 1200,
        valore_y: 1400,
        prezzo_vendita: 0,
        prezzo_acquisto_netto: 100, // già netto
      },
    ];
    const r = calcolaPrezzoFamiglia(
      { family, selections: {}, larghezza_mm: 1200, altezza_mm: 1400, quantita: 1 },
      griglia,
    );
    // Con sconti 0/0 applyScontiFornitore è identità: netto = 100
    // vendita = 100 × 1.45 = 145
    expect(r.unit_price_acquisto).toBe(100);
    expect(r.unit_price_vendita).toBeCloseTo(145, 2);
  });

  it("mode=acquisto_markup + markup=none → vendita = netto (no margine)", () => {
    const family = makeFamily({
      modalita_prezzo_base: "griglia",
      prezzo_base_mode: "acquisto_markup",
      markup_tipo: "none",
      markup_valore: 0,
      sconto_fornitore_1: 30,
      sconto_fornitore_2: 0,
    });
    const griglia: GridPoint[] = [
      {
        valore_x: 1000,
        valore_y: 1000,
        prezzo_vendita: 0,
        prezzo_acquisto_netto: 200, // LORDO
      },
    ];
    const r = calcolaPrezzoFamiglia(
      { family, selections: {}, larghezza_mm: 1000, altezza_mm: 1000, quantita: 1 },
      griglia,
    );
    // netto = 200 × 0.7 = 140, vendita = netto (no markup)
    expect(r.unit_price_acquisto).toBeCloseTo(140, 2);
    expect(r.unit_price_vendita).toBeCloseTo(140, 2);
  });

  it("mode=vendita ignora sconti/markup anche se configurati (retrocompat)", () => {
    const family = makeFamily({
      modalita_prezzo_base: "griglia",
      prezzo_base_mode: "vendita",
      // Sconti/markup presenti ma IGNORATI in mode=vendita
      markup_tipo: "percentuale",
      markup_valore: 999,
      sconto_fornitore_1: 50,
      sconto_fornitore_2: 3,
    });
    const griglia: GridPoint[] = [
      {
        valore_x: 1200,
        valore_y: 1400,
        prezzo_vendita: 300, // vendita diretta (rispettata)
        prezzo_acquisto_netto: 180,
      },
    ];
    const r = calcolaPrezzoFamiglia(
      { family, selections: {}, larghezza_mm: 1200, altezza_mm: 1400, quantita: 1 },
      griglia,
    );
    expect(r.unit_price_vendita).toBe(300);
    expect(r.unit_price_acquisto).toBe(180);
  });

  it("mode=acquisto_markup su mq: lordo/mq × mq → netto totale → markup", () => {
    // €/mq lordo listino × mq = lordo totale → sconti → netto → markup
    const family = makeFamily({
      modalita_prezzo_base: "mq",
      prezzo_base_mode: "acquisto_markup",
      prezzo_base_acquisto: 200, // lordo €200/mq
      markup_tipo: "percentuale",
      markup_valore: 50,
      sconto_fornitore_1: 40,
      sconto_fornitore_2: 0,
    });
    const r = calcolaPrezzoFamiglia({
      family,
      selections: {},
      larghezza_mm: 1000,
      altezza_mm: 1000,
      quantita: 1,
    });
    // mq = 1, lordo_tot = 200, netto = 200 × 0.6 = 120, vendita = 120 × 1.5 = 180
    expect(r.unit_price_acquisto).toBeCloseTo(120, 2);
    expect(r.unit_price_vendita).toBeCloseTo(180, 2);
  });

  it("mode=acquisto_markup + maggiorazione asse percentuale applicata DOPO markup", () => {
    const valColor = makeValue({
      id: "val-rosso",
      valore: "rosso",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 10, // +10% sul vendita
      maggiorazione_acquisto: 10, // +10% sul netto
    });
    const axisColor = makeAxis({
      codice: "colore",
      values: [valColor],
      sort_order: 1,
    });
    const family = makeFamily({
      modalita_prezzo_base: "griglia",
      prezzo_base_mode: "acquisto_markup",
      markup_tipo: "percentuale",
      markup_valore: 100,
      sconto_fornitore_1: 50,
      sconto_fornitore_2: 0,
      axes: [axisColor],
    });
    const griglia: GridPoint[] = [
      {
        valore_x: 1000,
        valore_y: 1000,
        prezzo_vendita: 0,
        prezzo_acquisto_netto: 1000, // LORDO
      },
    ];
    const r = calcolaPrezzoFamiglia(
      {
        family,
        selections: { colore: "val-rosso" },
        larghezza_mm: 1000,
        altezza_mm: 1000,
        quantita: 1,
      },
      griglia,
    );
    // netto = 1000 × 0.5 = 500; vendita_base = 500 × 2 = 1000
    // +10% maggiorazione: vendita = 1100, acquisto netto = 550
    expect(r.unit_price_vendita).toBeCloseTo(1100, 2);
    expect(r.unit_price_acquisto).toBeCloseTo(550, 2);
  });
});

describe("calcolaPrezzoFamiglia — prezzo assoluto per-valore (Linea)", () => {
  // Regressione bug Renova Solution (22/09/2026): Aluplast e Salamander sullo
  // stesso asse "Linea", entrambe fascia "medium" (maggiorazione 0%/"none").
  // Prima del fix condividevano lo stesso prezzo_base_vendita → stesso prezzo
  // mostrato per costruzione; cambiare il prezzo base della tipologia
  // "cambiava automaticamente" anche l'altra marca. Ora ogni valore col
  // proprio prezzo_vendita è indipendente.
  it("pz: valore con prezzo_vendita proprio sostituisce il base, un altro valore non collegato resta al suo", () => {
    const aluplast = makeValue({
      id: "val-aluplast",
      valore: "aluplast_ideal_5000",
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
      prezzo_vendita: 720,
    });
    const salamander = makeValue({
      id: "val-salamander",
      valore: "salamander_76",
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
      prezzo_vendita: 850, // marca modificata indipendentemente
    });
    const linea = makeAxis({ codice: "linea", values: [aluplast, salamander] });
    const family = makeFamily({
      modalita_prezzo_base: "pz",
      prezzo_base_vendita: 720,
      axes: [linea],
    });
    const rAluplast = calcolaPrezzoFamiglia({
      family,
      selections: { linea: "val-aluplast" },
      quantita: 1,
    });
    const rSalamander = calcolaPrezzoFamiglia({
      family,
      selections: { linea: "val-salamander" },
      quantita: 1,
    });
    expect(rAluplast.unit_price_vendita).toBe(720);
    expect(rSalamander.unit_price_vendita).toBe(850);
    expect(rSalamander.maggiorazioni_applicate[0].tipo).toBe("prezzo_assoluto");
  });

  it("mq: prezzo_vendita del valore è un €/mq indipendente, moltiplicato per i mq come il base", () => {
    const premium = makeValue({
      id: "val-premium",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 999, // deve essere ignorata: prevale il prezzo proprio
      prezzo_vendita: 300, // €/mq indipendente
    });
    const axis = makeAxis({ codice: "linea", values: [premium] });
    const family = makeFamily({
      modalita_prezzo_base: "mq",
      prezzo_base_vendita: 200,
      axes: [axis],
    });
    const r = calcolaPrezzoFamiglia({
      family,
      selections: { linea: "val-premium" },
      larghezza_mm: 1000,
      altezza_mm: 1000,
      quantita: 1,
    });
    // mq = 1 → 300 €/mq × 1 mq = 300, non 200×(1+999%)
    expect(r.unit_price_vendita).toBe(300);
  });

  it("griglia: il prezzo_vendita del valore viene ignorato, resta la maggiorazione", () => {
    const valColor = makeValue({
      id: "val-rosso",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 10,
      prezzo_vendita: 999999, // non deve avere alcun effetto in modalità griglia
    });
    const axis = makeAxis({ codice: "colore", values: [valColor] });
    const family = makeFamily({
      modalita_prezzo_base: "griglia",
      axes: [axis],
    });
    const griglia: GridPoint[] = [
      { valore_x: 1000, valore_y: 1000, prezzo_vendita: 420, prezzo_acquisto_netto: 0 },
    ];
    const r = calcolaPrezzoFamiglia(
      {
        family,
        selections: { colore: "val-rosso" },
        larghezza_mm: 1000,
        altezza_mm: 1000,
        quantita: 1,
      },
      griglia,
    );
    // 420 × 1.10 = 462, non 999999
    expect(r.unit_price_vendita).toBe(462);
  });

  it("prezzo_acquisto proprio sostituisce l'acquisto; se assente resta quello calcolato dal base", () => {
    const conAcquisto = makeValue({
      id: "val-con-acquisto",
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
      prezzo_vendita: 500,
      prezzo_acquisto: 250,
    });
    const senzaAcquisto = makeValue({
      id: "val-senza-acquisto",
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
      prezzo_vendita: 500,
      prezzo_acquisto: null,
    });
    const axis = makeAxis({ codice: "linea", values: [conAcquisto, senzaAcquisto] });
    const family = makeFamily({
      modalita_prezzo_base: "pz",
      prezzo_base_vendita: 720,
      prezzo_base_acquisto: 400,
      axes: [axis],
    });
    const rCon = calcolaPrezzoFamiglia({
      family,
      selections: { linea: "val-con-acquisto" },
      quantita: 1,
    });
    const rSenza = calcolaPrezzoFamiglia({
      family,
      selections: { linea: "val-senza-acquisto" },
      quantita: 1,
    });
    expect(rCon.unit_price_acquisto).toBe(250);
    expect(rSenza.unit_price_acquisto).toBe(400);
  });
});

