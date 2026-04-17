// FASE 7.4 — Test unit della logica di enrichment AI (nearest-neighbor griglia + mq)
//
// La logica vera sta in supabase/functions/ai-genera-preventivo-v2/index.ts.
// Qui riproduciamo le funzioni pure per testare il comportamento atteso.
// Se la logica dell'edge function cambia, questi test vanno aggiornati di conseguenza.

import { describe, expect, it } from "vitest";

// ─── Copia locale delle funzioni pure da ai-genera-preventivo-v2 ─────────────
// (le rimpiazziamo con import diretto quando Deno/Node import-mapping sarà unificato)

type GridPoint = { x_mm: number; y_mm: number; prezzo_vendita: number };

function nearestInGriglia(punti: GridPoint[], x: number, y: number): number | null {
  if (!punti || punti.length === 0) return null;
  for (const p of punti) {
    if (p.x_mm === x && p.y_mm === y) return p.prezzo_vendita;
  }
  let best = punti[0];
  let bestDist = Math.abs(best.x_mm - x) + Math.abs(best.y_mm - y);
  for (let i = 1; i < punti.length; i++) {
    const d = Math.abs(punti[i].x_mm - x) + Math.abs(punti[i].y_mm - y);
    if (d < bestDist) {
      best = punti[i];
      bestDist = d;
    }
  }
  return best.prezzo_vendita;
}

/**
 * Calcola unit_price per una riga AI in base alla modalità del prodotto.
 * Versione pura estratta dall'enrichment dell'edge function.
 */
function computeUnitPrice(
  prod: {
    modalita_prezzo: "pz" | "mq" | "griglia" | "misura_libera" | string;
    prezzo_vendita: number;
  },
  griglia: GridPoint[] | null,
  misureXmm: number | null,
  misureYmm: number | null,
): { price: number | null; warning: string | null } {
  const modalita = prod.modalita_prezzo ?? "pz";
  if (modalita === "mq") {
    if (misureXmm != null && misureYmm != null && misureXmm > 0 && misureYmm > 0) {
      const mq = (misureXmm / 1000) * (misureYmm / 1000);
      return { price: Math.round(prod.prezzo_vendita * mq * 100) / 100, warning: null };
    }
    return { price: prod.prezzo_vendita, warning: "mq senza misure" };
  }
  if (modalita === "griglia") {
    const punti = griglia ?? [];
    if (punti.length === 0) return { price: prod.prezzo_vendita, warning: "griglia vuota" };
    if (misureXmm == null || misureYmm == null || misureXmm <= 0 || misureYmm <= 0) {
      return { price: null, warning: "griglia senza misure" };
    }
    const pv = nearestInGriglia(punti, misureXmm, misureYmm);
    const exact = punti.some((p) => p.x_mm === misureXmm && p.y_mm === misureYmm);
    return { price: pv, warning: exact ? null : "nearest-neighbor" };
  }
  // pz | misura_libera | altro → flat
  return { price: prod.prezzo_vendita, warning: null };
}

describe("nearestInGriglia", () => {
  it("ritorna null per griglia vuota", () => {
    expect(nearestInGriglia([], 1000, 1000)).toBeNull();
  });

  it("ritorna il prezzo esatto se la misura coincide con un punto", () => {
    const punti: GridPoint[] = [
      { x_mm: 1000, y_mm: 1000, prezzo_vendita: 100 },
      { x_mm: 1200, y_mm: 1400, prezzo_vendita: 180 },
    ];
    expect(nearestInGriglia(punti, 1200, 1400)).toBe(180);
  });

  it("sceglie il nearest-neighbor in distanza Manhattan", () => {
    const punti: GridPoint[] = [
      { x_mm: 1000, y_mm: 1000, prezzo_vendita: 100 },
      { x_mm: 1200, y_mm: 1400, prezzo_vendita: 180 },
      { x_mm: 1500, y_mm: 1500, prezzo_vendita: 220 },
    ];
    // 1250,1420 → distanza Manhattan da (1200,1400) = 50+20 = 70 (più vicino)
    expect(nearestInGriglia(punti, 1250, 1420)).toBe(180);
  });

  it("con 1 solo punto ritorna il suo prezzo", () => {
    expect(
      nearestInGriglia([{ x_mm: 1000, y_mm: 1000, prezzo_vendita: 42 }], 99999, 99999),
    ).toBe(42);
  });
});

describe("computeUnitPrice — modalità pz / misura_libera", () => {
  it("pz ritorna prezzo_vendita flat", () => {
    const r = computeUnitPrice({ modalita_prezzo: "pz", prezzo_vendita: 120 }, null, null, null);
    expect(r.price).toBe(120);
    expect(r.warning).toBeNull();
  });

  it("misura_libera ritorna prezzo_vendita flat", () => {
    const r = computeUnitPrice(
      { modalita_prezzo: "misura_libera", prezzo_vendita: 75 },
      null,
      null,
      null,
    );
    expect(r.price).toBe(75);
    expect(r.warning).toBeNull();
  });
});

describe("computeUnitPrice — modalità mq", () => {
  it("calcola unit_price = prezzo × (x/1000 × y/1000) con misure valide", () => {
    // prezzo 200 €/mq, 1200×1400mm → 1.68 mq → 336.00
    const r = computeUnitPrice(
      { modalita_prezzo: "mq", prezzo_vendita: 200 },
      null,
      1200,
      1400,
    );
    expect(r.price).toBe(336);
    expect(r.warning).toBeNull();
  });

  it("arrotonda a 2 decimali", () => {
    // prezzo 150 €/mq, 1234×876mm → 1.0809... mq → 162.14 (150 * 1.080984 = 162.1476)
    const r = computeUnitPrice(
      { modalita_prezzo: "mq", prezzo_vendita: 150 },
      null,
      1234,
      876,
    );
    expect(r.price).toBeCloseTo(162.15, 1);
  });

  it("senza misure ritorna prezzo_vendita + warning", () => {
    const r = computeUnitPrice(
      { modalita_prezzo: "mq", prezzo_vendita: 200 },
      null,
      null,
      null,
    );
    expect(r.price).toBe(200);
    expect(r.warning).toBe("mq senza misure");
  });
});

describe("computeUnitPrice — modalità griglia", () => {
  const griglia: GridPoint[] = [
    { x_mm: 1000, y_mm: 1000, prezzo_vendita: 300 },
    { x_mm: 1200, y_mm: 1400, prezzo_vendita: 420 },
    { x_mm: 1500, y_mm: 1600, prezzo_vendita: 520 },
  ];

  it("con misura esatta ritorna prezzo della griglia", () => {
    const r = computeUnitPrice(
      { modalita_prezzo: "griglia", prezzo_vendita: 0 },
      griglia,
      1200,
      1400,
    );
    expect(r.price).toBe(420);
    expect(r.warning).toBeNull();
  });

  it("con misura non in griglia usa nearest + warning", () => {
    const r = computeUnitPrice(
      { modalita_prezzo: "griglia", prezzo_vendita: 0 },
      griglia,
      1250,
      1420,
    );
    expect(r.price).toBe(420);
    expect(r.warning).toBe("nearest-neighbor");
  });

  it("con griglia vuota fallback su prezzo_vendita + warning", () => {
    const r = computeUnitPrice(
      { modalita_prezzo: "griglia", prezzo_vendita: 99 },
      [],
      1200,
      1400,
    );
    expect(r.price).toBe(99);
    expect(r.warning).toBe("griglia vuota");
  });

  it("con griglia presente ma misure mancanti ritorna null + warning", () => {
    const r = computeUnitPrice(
      { modalita_prezzo: "griglia", prezzo_vendita: 0 },
      griglia,
      null,
      null,
    );
    expect(r.price).toBeNull();
    expect(r.warning).toBe("griglia senza misure");
  });
});
