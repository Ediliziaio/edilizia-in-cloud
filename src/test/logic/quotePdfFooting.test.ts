import { describe, expect, it } from "vitest";

/**
 * Test dell'ALGORITMO di footing IVA del PDF preventivo
 * (supabase/functions/generate-quote-pdf/index.ts).
 *
 * Invariante del documento: SUBTOTALE − Sconto + Σ(righe IVA) = TOTALE, al
 * centesimo, usando i valori autoritativi stored (subtotal / discount_amount /
 * total). Il PDF deriva l'IVA dal totale e fa assorbire il residuo di
 * arrotondamento all'ultima aliquota, così le righe tornano SEMPRE esatte.
 *
 * Qui replichiamo 1:1 quella logica e la stress-testiamo su preventivi
 * realistici + input casuali (single/multi aliquota, con/senza sconto globale).
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

type Item = {
  quantity: number;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
  is_optional?: boolean;
  line_total?: number | null;
};

// ── Simula la matematica del frontend (calcolaTotaliPreventivo + QuoteBuilder)
function computeStored(items: Item[], globalPct: number) {
  const active = items.filter((i) => !i.is_optional);
  let subtotale = 0;
  const ivaRaw: Record<number, number> = {};
  for (const it of active) {
    const imp = it.quantity * it.unit_price * (1 - (it.discount_percent || 0) / 100);
    subtotale += imp;
    ivaRaw[it.vat_rate] = (ivaRaw[it.vat_rate] || 0) + imp * (it.vat_rate / 100);
  }
  const subtotale_netto = round2(subtotale * (1 - globalPct / 100));
  const vatFactor = 1 - globalPct / 100;
  // Standard fiscale IT: IVA arrotondata PER ALIQUOTA, poi sommata
  // (= calcolaTotaliPreventivo dopo il fix). NON round-of-sum.
  const ivaNetto: Record<number, number> = {};
  for (const [k, v] of Object.entries(ivaRaw)) ivaNetto[+k] = round2(v * vatFactor);
  const vatAmount = round2(Object.values(ivaNetto).reduce((s, v) => s + v, 0));
  const totale = round2(subtotale_netto + vatAmount);
  const subtotal = round2(subtotale);
  const discount_amount = subtotal * (globalPct / 100);
  return { subtotal, discount_amount, vat_amount: vatAmount, total: totale };
}

// ── Replica ESATTA dell'algoritmo di footing nel PDF ──────────────────────
function pdfFooting(
  items: Item[],
  stored: { subtotal: number; discount_amount: number; total: number },
  globalPct: number,
) {
  const subTotShown = round2(Number(stored.subtotal || 0));
  const totShown = round2(Number(stored.total || 0));
  let scontoShown = round2(Number(stored.discount_amount || 0));
  let ivaToShow = round2(totShown - (subTotShown - scontoShown));
  if (ivaToShow < 0) {
    // Esente/quasi-esente con sconto: assorbi lo scarto ≤1 cent nello sconto.
    scontoShown = round2(scontoShown - ivaToShow);
    ivaToShow = 0;
  }

  const ivaBreakdown: Record<number, number> = {};
  const discFactor = 1 - globalPct / 100;
  for (const item of items.filter((i) => !i.is_optional)) {
    const rate = Number(item.vat_rate ?? 22);
    const lt = item.line_total;
    const lineAmt = lt != null
      ? Number(lt)
      : item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100);
    ivaBreakdown[rate] = (ivaBreakdown[rate] || 0) + lineAmt * (rate / 100);
  }
  const ivaRates = Object.keys(ivaBreakdown).map(Number).sort((a, b) => a - b);
  const positiveRates = ivaRates.filter((r) => ivaBreakdown[r] * discFactor >= 0.005);

  const lines: Array<{ rate: number | null; value: number }> = [];
  let residualApplied = 0;
  if (positiveRates.length > 1) {
    const rows = positiveRates.map((rate) => ({ rate, value: round2(ivaBreakdown[rate] * discFactor) }));
    const sumRows = round2(rows.reduce((s, r) => s + r.value, 0));
    const residual = round2(ivaToShow - sumRows);
    residualApplied = residual;
    if (residual !== 0) {
      let maxI = 0;
      for (let i = 1; i < rows.length; i++) if (rows[i].value > rows[maxI].value) maxI = i;
      rows[maxI].value = round2(rows[maxI].value + residual);
    }
    for (const r of rows) lines.push({ rate: r.rate as number | null, value: r.value });
  } else {
    const soleRate = positiveRates.length === 1
      ? positiveRates[0]
      : (ivaRates.length === 1 ? ivaRates[0] : null);
    lines.push({ rate: soleRate, value: ivaToShow });
  }
  return { subTotShown, scontoShown, totShown, lines, residualApplied };
}

function assertFoots(items: Item[], globalPct: number) {
  const stored = computeStored(items, globalPct);
  const { subTotShown, scontoShown, totShown, lines, residualApplied } = pdfFooting(items, stored, globalPct);
  const sumIva = round2(lines.reduce((s, l) => s + l.value, 0));
  // SENZA sconto l'IVA deve essere ESATTA senza alcun aggiustamento: il
  // residuo di footing è provabilmente 0 (per-aliquota == fiscale).
  if (globalPct === 0) expect(residualApplied).toBe(0);
  // Invariante centrale: SUBTOTALE − Sconto + ΣIVA = TOTALE, al centesimo.
  expect(round2(subTotShown - scontoShown + sumIva)).toBe(totShown);
  // Nessuna riga IVA negativa su input sani.
  for (const l of lines) expect(l.value).toBeGreaterThanOrEqual(0);
  return { stored, lines };
}

describe("PDF preventivo — footing IVA garantito", () => {
  it("aliquota unica, nessuno sconto (caso base)", () => {
    assertFoots(
      [{ quantity: 4, unit_price: 850, discount_percent: 0, vat_rate: 22 }],
      0,
    );
  });

  it("multi-aliquota (22 + 10 + 4) senza sconto: le righe sommano al totale", () => {
    const { lines } = assertFoots(
      [
        { quantity: 3, unit_price: 333.33, discount_percent: 0, vat_rate: 22 },
        { quantity: 7, unit_price: 12.34, discount_percent: 5, vat_rate: 10 },
        { quantity: 1, unit_price: 99.99, discount_percent: 0, vat_rate: 4 },
      ],
      0,
    );
    expect(lines.length).toBe(3);
  });

  it("SENZA sconto: multi-aliquota dove round-of-sum ≠ sum-of-rounds → esatto, 0 aggiustamenti", () => {
    // Costruito perché ogni aliquota produca un'IVA che arrotonda per eccesso:
    // sum-of-rounds e round-of-sum divergono di 1 cent. Col fix a monte il
    // totale usa il metodo fiscale (per-aliquota) e il PDF NON deve aggiustare.
    const items: Item[] = [
      { quantity: 1, unit_price: 45.48, discount_percent: 0, vat_rate: 22 }, // iva 10.0056 → 10.01
      { quantity: 1, unit_price: 200.05, discount_percent: 0, vat_rate: 10 }, // iva 20.005 → 20.01 (o .00, dipende)
      { quantity: 1, unit_price: 750.13, discount_percent: 0, vat_rate: 4 },  // iva 30.0052 → 30.01
    ];
    const { stored, lines } = assertFoots(items, 0);
    // Ogni riga IVA è ESATTAMENTE l'arrotondamento per aliquota (nessun fudge).
    const byRate: Record<number, number> = {};
    for (const it of items) {
      byRate[it.vat_rate] = round2((byRate[it.vat_rate] ?? 0) + it.quantity * it.unit_price * it.vat_rate / 100);
    }
    for (const l of lines) {
      if (l.rate != null) expect(l.value).toBe(byRate[l.rate]);
    }
    // e il totale IVA stored = somma delle righe (metodo fiscale).
    expect(round2(lines.reduce((s, l) => s + l.value, 0))).toBe(stored.vat_amount);
  });

  it("multi-aliquota CON sconto globale 5% (il caso che generava lo scarto)", () => {
    assertFoots(
      [
        { quantity: 3, unit_price: 333.33, discount_percent: 0, vat_rate: 22 },
        { quantity: 7, unit_price: 12.34, discount_percent: 5, vat_rate: 10 },
        { quantity: 2, unit_price: 77.77, discount_percent: 0, vat_rate: 4 },
      ],
      5,
    );
  });

  it("aliquota unica con sconto globale 12%", () => {
    assertFoots(
      [
        { quantity: 5, unit_price: 123.45, discount_percent: 0, vat_rate: 22 },
        { quantity: 2, unit_price: 678.9, discount_percent: 10, vat_rate: 22 },
      ],
      12,
    );
  });

  it("righe esenti (0%) miste a 22%: nessuna riga 'IVA 0%' spuria, totale torna", () => {
    const { lines } = assertFoots(
      [
        { quantity: 1, unit_price: 1000, discount_percent: 0, vat_rate: 22 },
        { quantity: 1, unit_price: 500, discount_percent: 0, vat_rate: 0 },
      ],
      0,
    );
    // Solo la 22% contribuisce → una sola riga IVA.
    expect(lines.length).toBe(1);
    expect(lines[0].rate).toBe(22);
  });

  it("tutte esenti (0%): una riga IVA 0% = 0,00 e totale = imponibile", () => {
    const { stored, lines } = assertFoots(
      [{ quantity: 3, unit_price: 100, discount_percent: 0, vat_rate: 0 }],
      0,
    );
    expect(lines.length).toBe(1);
    expect(lines[0].value).toBe(0);
    expect(stored.total).toBe(stored.subtotal);
  });

  it("riga omaggio (line_total = 0) non ricade sul calcolo prezzo×qtà", () => {
    // line_total esplicito 0 deve restare 0 (il vecchio `|| calcolo` lo perdeva).
    const items: Item[] = [
      { quantity: 1, unit_price: 200, discount_percent: 0, vat_rate: 22, line_total: 200 },
      { quantity: 1, unit_price: 200, discount_percent: 0, vat_rate: 22, line_total: 0 },
    ];
    // IVA solo sulla riga a pagamento (200 × 22% = 44).
    const stored = computeStored(
      [{ quantity: 1, unit_price: 200, discount_percent: 0, vat_rate: 22 }],
      0,
    );
    const { lines } = pdfFooting(items, stored, 0);
    const sumIva = round2(lines.reduce((s, l) => s + l.value, 0));
    expect(sumIva).toBe(44);
  });

  it("stress: 400 preventivi casuali tornano sempre al centesimo", () => {
    // PRNG deterministico (no Math.random → test riproducibile).
    let seed = 987654321;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const rates = [22, 10, 4, 0];
    for (let n = 0; n < 400; n++) {
      const nItems = 1 + Math.floor(rnd() * 8);
      const items: Item[] = [];
      for (let i = 0; i < nItems; i++) {
        items.push({
          quantity: round2(0.5 + rnd() * 20),
          unit_price: round2(1 + rnd() * 5000),
          discount_percent: Math.floor(rnd() * 4) * 5, // 0/5/10/15
          vat_rate: rates[Math.floor(rnd() * rates.length)],
          is_optional: rnd() < 0.1,
        });
      }
      const globalPct = Math.floor(rnd() * 4) * 5; // 0/5/10/15
      // almeno una riga non-opzionale
      if (items.every((i) => i.is_optional)) items[0].is_optional = false;
      assertFoots(items, globalPct);
    }
  });
});
