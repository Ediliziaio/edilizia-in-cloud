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
    prezzo_base_vendita: 100,
    prezzo_base_acquisto: 60,
    vat_rate: 22,
    unit_of_measure: "pz",
    posa_tariffa_default_id: null,
    posa_quantita_default: 0,
    griglia_asse_x_label: "Larghezza",
    griglia_asse_y_label: "Altezza",
    griglia_unita: "mm",
    attivo: true,
    sort_order: 0,
    custom_field_values: {},
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
