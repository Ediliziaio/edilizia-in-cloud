/**
 * Preventivo classico: il totale che si vede in pagina è quello che il database
 * salva e che il PDF stampa (controllo di correttezza del 06/10/2026).
 *
 * Il database non salva i numeri come li scrive la pagina: `quote_items` ha
 * quantity numeric(10,2), unit_price numeric(12,2), discount_percent e
 * vat_rate numeric(5,2), arrotonda a quella scala e solo DOPO calcola
 * `line_total` e i totali (do_recalculate_quote_totals). I risultati attesi qui
 * sotto sono ricalcolati in modo indipendente, in aritmetica decimale esatta
 * (src/test/helpers/numericoPostgres.ts), oppure a mano (spiegati nei commenti).
 *
 * Prima di questa correzione, con più di due decimali in quantità o prezzo
 * (0,333 × 100; 3 × 122,265) la pagina diceva un totale e il database un altro:
 * il salvataggio finiva in errore («i totali restituiti dal server differiscono
 * dall'anteprima») dopo aver già scritto righe e testata.
 */
import { describe, expect, it } from "vitest";
import { calcolaTotaliPreventivo, importoRiga, round2, subtotaleFinoA } from "@/hooks/usePreventivoCosti";
import { assertSavedQuoteAmounts } from "@/lib/preventivi/quoteSaveValidation";
import { inNumero, lineTotalDb, totaliDb, type RigaClient } from "../helpers/numericoPostgres";

type Riga = RigaClient & { item_category?: string; prezzo_acquisto?: number };

const riga = (extra: Partial<Riga> = {}): Riga => ({
  quantity: 1, unit_price: 0, discount_percent: 0, vat_rate: 22, is_optional: false, item_category: "prodotto", ...extra,
});

/** Come QuoteBuilder ricava dalla funzione i numeri che scrive su `quotes`. */
function dellApp(righe: Riga[], scontoPct = 0, manuale: number | null = null, ivaManuale: number | null = null) {
  const t = calcolaTotaliPreventivo(
    righe.map((r) => ({
      quantity: r.quantity, unit_price: r.unit_price, discount_percent: r.discount_percent ?? 0,
      vat_rate: r.vat_rate ?? 22, is_optional: r.is_optional ?? false, item_category: r.item_category, prezzo_acquisto: r.prezzo_acquisto ?? 0,
    })),
    0, scontoPct, manuale, ivaManuale,
  );
  return {
    subtotal: t.subtotale,
    discount_amount: Math.round((t.subtotale - t.subtotale_netto) * 100) / 100,
    vat_amount: Math.round((t.totale - t.subtotale_netto) * 100) / 100,
    total: t.totale,
    breakdown: t.iva_breakdown,
  };
}

/** Come lo rifà il database dalle righe salvate. */
function dalDatabase(righe: Riga[], scontoPct = 0, manuale: number | null = null, ivaManuale: number | null = null) {
  // La riga «Sconto» si salva già col prezzo in negativo (normalizzaRigaSconto).
  const salvate = righe.map((r) => (r.item_category === "sconto" ? { ...r, unit_price: -Math.abs(r.unit_price), discount_percent: 0 } : r));
  const t = totaliDb(salvate, scontoPct, manuale, ivaManuale);
  return { subtotal: inNumero(t.subtotal), discount_amount: inNumero(t.discount_amount), vat_amount: inNumero(t.vat_amount), total: inNumero(t.total) };
}

const soloImporti = (x: ReturnType<typeof dellApp>) => ({ subtotal: x.subtotal, discount_amount: x.discount_amount, vat_amount: x.vat_amount, total: x.total });

function tornano(righe: Riga[], scontoPct = 0, manuale: number | null = null, ivaManuale: number | null = null) {
  const app = dellApp(righe, scontoPct, manuale, ivaManuale);
  const db = dalDatabase(righe, scontoPct, manuale, ivaManuale);
  expect(soloImporti(app)).toEqual(db);
  // Quello che il salvataggio controlla prima del PDF.
  expect(() => assertSavedQuoteAmounts(db, soloImporti(app))).not.toThrow();
  return { app, db };
}

describe("controllo del calcolo: il database è la verità", () => {
  it("l'emulatore decimale arrotonda come PostgreSQL (il mezzo si allontana da zero)", () => {
    // 1,5 × 0,01 = 0,015 → 0,02 ; 2,5 × 33,33 = 83,325 → 83,33 ; −0,015 → −0,02.
    expect(inNumero(lineTotalDb({ quantity: 1.5, unit_price: 0.01 }))).toBe(0.02);
    expect(inNumero(lineTotalDb({ quantity: 2.5, unit_price: 33.33 }))).toBe(83.33);
    expect(inNumero(lineTotalDb({ quantity: 1.5, unit_price: -0.01 }))).toBe(-0.02);
    // Quantità e prezzo vengono arrotondati a due decimali PRIMA del prodotto: 0,333 → 0,33.
    expect(inNumero(lineTotalDb({ quantity: 0.333, unit_price: 100 }))).toBe(33);
  });

  // ── 1. Scenari a mano ────────────────────────────────────────────────────────
  it("1) semplice: 4 × 850 € al 22% = 3.400 + 748 = 4.148", () => {
    const { app } = tornano([riga({ quantity: 4, unit_price: 850 })]);
    expect(soloImporti(app)).toEqual({ subtotal: 3400, discount_amount: 0, vat_amount: 748, total: 4148 });
  });

  it("2) sconto di riga 5% + sconto globale 5%", () => {
    // A: 2 × 1.200 −5% = 2.280,00 ; B: 846,00 ; base 3.126,00.
    // Globale 5%: netto 3.126 × 0,95 = 2.969,70 ; sconto 156,30.
    // IVA 22%: 3.126 × 0,22 = 687,72 → × 0,95 = 653,334 → 653,33 ; totale 3.623,03.
    const { app } = tornano([riga({ quantity: 2, unit_price: 1200, discount_percent: 5 }), riga({ unit_price: 846 })], 5);
    expect(soloImporti(app)).toEqual({ subtotal: 3126, discount_amount: 156.3, vat_amount: 653.33, total: 3623.03 });
  });

  it("3) riga «Sconto» (importo fisso) con sconto globale: 1.000 − 100 € al 22%, poi −10%", () => {
    // Base 900 ; con −10%: netto 810 ; IVA 900 × 0,22 × 0,9 = 178,20 ; totale 988,20.
    const righe = [riga({ unit_price: 1000 }), riga({ item_category: "sconto", unit_price: 100 })];
    const { app } = tornano(righe, 10);
    expect(soloImporti(app)).toEqual({ subtotal: 900, discount_amount: 90, vat_amount: 178.2, total: 988.2 });
  });

  it("4) IVA mista 4/10/22, senza e con sconto globale 10%", () => {
    const righe = [
      riga({ unit_price: 1000, vat_rate: 4 }), riga({ unit_price: 2000, vat_rate: 10 }), riga({ unit_price: 3000, vat_rate: 22 }),
    ];
    // Senza sconto: IVA 40 + 200 + 660 = 900 ; totale 6.900.
    expect(soloImporti(tornano(righe).app)).toEqual({ subtotal: 6000, discount_amount: 0, vat_amount: 900, total: 6900 });
    // Con −10%: netto 5.400 ; IVA 36 + 180 + 594 = 810 ; totale 6.210.
    const con = tornano(righe, 10).app;
    expect(soloImporti(con)).toEqual({ subtotal: 6000, discount_amount: 600, vat_amount: 810, total: 6210 });
    expect(con.breakdown).toEqual({ "4": 36, "10": 180, "22": 594 });
  });

  it("5) prezzo scritto a mano: 5.000 € con IVA 10% e sconto 20%", () => {
    // Le righe stanno a 0 €. Netto 4.000 ; IVA 400 ; totale 4.400.
    const { app } = tornano([riga({ unit_price: 0 }), riga({ unit_price: 0 })], 20, 5000, 10);
    expect(soloImporti(app)).toEqual({ subtotal: 5000, discount_amount: 1000, vat_amount: 400, total: 4400 });
  });

  it("6) quantità decimali: 3 × 33,33 + 0,5 × 1.234,56", () => {
    // 99,99 + 617,28 = 717,27 ; IVA 22% = 157,7994 → 157,80 ; totale 875,07.
    const { app } = tornano([riga({ quantity: 3, unit_price: 33.33 }), riga({ quantity: 0.5, unit_price: 1234.56 })]);
    expect(soloImporti(app)).toEqual({ subtotal: 717.27, discount_amount: 0, vat_amount: 157.8, total: 875.07 });
  });

  it("7) si arrotonda PER RIGA (come line_total del database), non sul totale", () => {
    // 1,5 × 0,01 = 0,015 → 0,02 per riga: due righe fanno 0,04, non 0,03.
    // IVA 22% su 0,04 = 0,0088 → 0,01 ; totale 0,05.
    const { app } = tornano([riga({ quantity: 1.5, unit_price: 0.01 }), riga({ quantity: 1.5, unit_price: 0.01 })]);
    expect(soloImporti(app)).toEqual({ subtotal: 0.04, discount_amount: 0, vat_amount: 0.01, total: 0.05 });
  });

  it("8) voci a 0 € (omaggi) non cambiano niente; opzionali e note restano fuori", () => {
    const righe = [
      riga({ unit_price: 100 }), riga({ unit_price: 0 }), riga({ unit_price: 500, is_optional: true }),
      riga({ item_category: "nota" }), riga({ item_category: "subtotale" }),
    ];
    expect(soloImporti(tornano(righe).app)).toEqual({ subtotal: 100, discount_amount: 0, vat_amount: 22, total: 122 });
  });

  it("9) computo vuoto: tutto a zero, niente NaN né «-0»", () => {
    const t = dellApp([]);
    expect(soloImporti(t)).toEqual({ subtotal: 0, discount_amount: 0, vat_amount: 0, total: 0 });
    for (const v of Object.values(soloImporti(t))) expect(Object.is(v, -0)).toBe(false);
    expect(t.breakdown).toEqual({});
  });

  it("10) sconto 100%: totale zero, IVA zero", () => {
    expect(soloImporti(tornano([riga({ unit_price: 250 })], 100).app)).toEqual({ subtotal: 250, discount_amount: 250, vat_amount: 0, total: 0 });
  });

  // ── 2. Valori sporchi: mai NaN, Infinity o «-0» a schermo ─────────────────────
  it("11) valori sporchi: una riga rotta non fa diventare NaN il totale delle altre", () => {
    const sporche = [
      riga({ unit_price: 100 }),
      riga({ quantity: Number.NaN, unit_price: 50 }),
      riga({ quantity: 2, unit_price: undefined as unknown as number }),
      riga({ quantity: 1, unit_price: Number.POSITIVE_INFINITY }),
      riga({ unit_price: 10, discount_percent: Number.NaN, vat_rate: null }),
    ];
    const t = dellApp(sporche, Number.NaN);
    for (const v of Object.values(soloImporti(t))) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Object.is(v, -0)).toBe(false);
    }
    // Contano solo le righe vere: 100 € e 10 € (IVA nulla → 22%).
    expect(soloImporti(t)).toEqual({ subtotal: 110, discount_amount: 0, vat_amount: 24.2, total: 134.2 });
  });

  it("12) quantità 0 e prezzo 0: la riga vale 0, il preventivo no", () => {
    expect(soloImporti(dellApp([riga({ quantity: 0, unit_price: 999 }), riga({ unit_price: 40 })]))).toEqual({ subtotal: 40, discount_amount: 0, vat_amount: 8.8, total: 48.8 });
  });

  // ── 3. Oltre le due decimali: era il difetto ─────────────────────────────────
  it("13) 0,333 × 100 €: il database salva 0,33 e la riga vale 33 €, non 33,30", () => {
    const { app, db } = tornano([riga({ quantity: 0.333, unit_price: 100 })]);
    expect(soloImporti(app)).toEqual(db);
    expect(db).toEqual({ subtotal: 33, discount_amount: 0, vat_amount: 7.26, total: 40.26 });
  });

  it("14) prezzo unitario 122,265 (m² × prezzo al m²) per 3 pezzi: 366,81 come il database, non 366,80", () => {
    // Il database arrotonda il prezzo a 122,27 PRIMA di moltiplicare: 3 × 122,27 = 366,81.
    const { app } = tornano([riga({ quantity: 3, unit_price: 122.26500000000001 })]);
    expect(app.subtotal).toBe(366.81);
  });

  it("15) quantità 2,555 al 10%: 25,60 come il database, non 25,55", () => {
    const { app } = tornano([riga({ quantity: 2.555, unit_price: 10, vat_rate: 10 })]);
    expect(app.subtotal).toBe(25.6);
  });

  it("16) sconto di riga 12,345% e IVA 21,999%: si arrotondano a due decimali come le colonne", () => {
    const { app } = tornano([riga({ unit_price: 100, discount_percent: 12.345, vat_rate: 21.999 })]);
    expect(app.subtotal).toBe(87.65);
  });

  it("17) quantità figlia 2 × (4/3) = 2,6667: la posa legata non fa più sfasare il totale", () => {
    // updateItem scala la posa in proporzione: la quantità arriva con quattro decimali.
    const { app } = tornano([riga({ quantity: 3, unit_price: 500 }), riga({ item_category: "posa", quantity: 2 * (4 / 3), unit_price: 90 })]);
    // 2,67 × 90 = 240,30 (il database), non 2,6667 × 90 = 240,00.
    expect(app.subtotal).toBe(1740.3);
  });

  it("18) prezzo scritto a mano con più di due decimali: arrotondato come numeric(12,2)", () => {
    const { app } = tornano([riga()], 0, 1234.5678, 22);
    expect(app.subtotal).toBe(1234.57);
  });

  // ── 4. Tanti scenari casuali (generatore deterministico) ─────────────────────
  function generatore(seme: number) {
    let a = seme;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const casuale = (rnd: () => number, decimali: number) => {
    const f = 10 ** decimali;
    return (massimo: number) => Math.round(rnd() * massimo * f) / f;
  };

  it.each([2, 4])("19) 4.000 preventivi casuali con %i decimali: pagina e database dicono lo stesso totale", (decimali) => {
    const rnd = generatore(20261006 + decimali);
    const n = casuale(rnd, decimali);
    let diversi = 0;
    for (let i = 0; i < 4000; i++) {
      const righe: Riga[] = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => riga({
        quantity: n(50), unit_price: n(2000), discount_percent: rnd() < 0.5 ? 0 : n(30), vat_rate: [4, 10, 22, 0][Math.floor(rnd() * 4)],
        is_optional: rnd() < 0.1,
      }));
      const sconto = rnd() < 0.5 ? 0 : n(30);
      const app = dellApp(righe, sconto);
      const db = dalDatabase(righe, sconto);
      if (JSON.stringify(soloImporti(app)) !== JSON.stringify(db)) diversi += 1;
      // Invarianti: totale = netto + IVA ; netto = lordo − sconto ; Σ IVA per aliquota = IVA.
      expect(round2(app.subtotal - app.discount_amount + app.vat_amount)).toBe(app.total);
      expect(round2(Object.values(app.breakdown).reduce((s, v) => s + v, 0))).toBe(app.vat_amount);
    }
    expect(diversi).toBe(0);
  });

  it("20) 2.000 prezzi scritti a mano casuali: pagina e database dicono lo stesso totale", () => {
    const rnd = generatore(777);
    const n = casuale(rnd, 3);
    for (let i = 0; i < 2000; i++) {
      // Un prezzo come lo scriverebbe una persona (fino a tre decimali), senza il rumore di una somma in virgola mobile.
      const manuale = (Math.round(rnd() * 50000 * 1000) + 10) / 1000;
      tornano([riga()], rnd() < 0.5 ? 0 : n(30), manuale, [0, 4, 10, 22][Math.floor(rnd() * 4)]);
    }
  });
});

describe("importo di una riga e subtotale a video", () => {
  it("l'importo di riga è quello del database (line_total), anche oltre le due decimali", () => {
    expect(importoRiga({ quantity: 3, unit_price: 122.26500000000001, discount_percent: 0 })).toBe(366.81);
    expect(importoRiga({ quantity: 0.333, unit_price: 100, discount_percent: 0 })).toBe(33);
    expect(importoRiga({ quantity: 1.5, unit_price: 0.01, discount_percent: 0 })).toBe(0.02);
    expect(importoRiga({ quantity: 2, unit_price: 1200, discount_percent: 5 })).toBe(2280);
  });

  it("una riga «Sconto» vale sempre in meno, mai «-0»", () => {
    expect(importoRiga({ quantity: 1, unit_price: 100, discount_percent: 0, item_category: "sconto" })).toBe(-100);
    expect(Object.is(importoRiga({ quantity: 1, unit_price: 0, discount_percent: 0, item_category: "sconto" }), -0)).toBe(false);
    expect(Object.is(importoRiga({ quantity: 0, unit_price: -5, discount_percent: 0 }), -0)).toBe(false);
  });

  it("valori mancanti o rotti valgono 0 (niente NaN a schermo)", () => {
    expect(importoRiga({ quantity: Number.NaN, unit_price: 10, discount_percent: 0 })).toBe(0);
    expect(importoRiga({ quantity: 2, unit_price: undefined as unknown as number, discount_percent: 0 })).toBe(0);
  });

  it("il «Subtotale» somma le righe sopra come il PDF: senza opzionali, note e altri subtotali", () => {
    const righe = [
      riga({ unit_price: 100 }),
      riga({ unit_price: 40, is_optional: true }),
      riga({ item_category: "nota" }),
      riga({ item_category: "sconto", unit_price: 10 }),
      riga({ item_category: "subtotale" }),
      riga({ unit_price: 1000 }),
    ];
    // Sopra il primo «Subtotale» (posizione 4): 100 − 10 = 90 ; l'opzionale (40) non c'è.
    expect(subtotaleFinoA(righe, 4)).toBe(90);
    // Sopra la fine: 90 + 1.000.
    expect(subtotaleFinoA(righe, righe.length)).toBe(1090);
    expect(subtotaleFinoA([], 0)).toBe(0);
  });
});
