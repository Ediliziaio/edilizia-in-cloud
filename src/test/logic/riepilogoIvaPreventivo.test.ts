/**
 * Il riepilogo IVA del PDF del preventivo (righeRiepilogoIva): subtotale − sconto
 * + righe IVA = totale, al centesimo, e ogni riga IVA è l'IVA VERA della sua
 * aliquota — quella che il database calcola (ROUND(SUM(line_total) * aliquota /
 * 100 * (1 − sconto/100), 2)), rifatta qui in aritmetica decimale esatta.
 *
 * Prima il PDF sommava le IVA delle singole righe e arrotondava senza il rumore
 * della virgola mobile: su circa 1 preventivo a più aliquote su 1.600 le righe
 * IVA uscivano di un centesimo diverse da quelle vere (totale giusto, righe
 * spostate), e con una riga nascosta nel PDF l'IVA di quella riga finiva etichettata
 * con l'aliquota di un'altra.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { arrotondaComePostgres, ivaPerAliquota, righeRiepilogoIva } from "../../../supabase/functions/_shared/riepilogoIvaPreventivo";
import { round2 } from "@/hooks/usePreventivoCosti";
import { arrotonda, dec, diff, diviso100, inNumero, lineTotalDb, per, rigaSalvata, somma, totaliDb, uno, type RigaClient } from "../helpers/numericoPostgres";

const riga = (importo: number, aliquota: number, extra: Record<string, unknown> = {}) => ({ line_total: importo, vat_rate: aliquota, is_optional: false, ...extra });
const somma2 = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

describe("righeRiepilogoIva: scenari a mano", () => {
  it("un'aliquota sola: una riga «IVA 22%»", () => {
    // 3.400 × 22% = 748 ; totale 4.148.
    const r = righeRiepilogoIva({ righe: [riga(3400, 22)], subtotal: 3400, discount_amount: 0, total: 4148, discount_percent: 0 });
    expect(r.righeIva).toEqual([{ aliquota: 22, valore: 748 }]);
    expect(r.ivaToShow).toBe(748);
  });

  it("tre aliquote con sconto 10%: 36 + 180 + 594 = 810, totale 6.210", () => {
    const r = righeRiepilogoIva({
      righe: [riga(1000, 4), riga(2000, 10), riga(3000, 22)], subtotal: 6000, discount_amount: 600, total: 6210, discount_percent: 10,
    });
    expect(r.righeIva).toEqual([{ aliquota: 4, valore: 36 }, { aliquota: 10, valore: 180 }, { aliquota: 22, valore: 594 }]);
    expect(somma2(r.righeIva.map((x) => x.valore))).toBe(r.ivaToShow);
    expect(somma2([r.subTotShown, -r.scontoShown, r.ivaToShow])).toBe(r.totShown);
  });

  it("le righe esenti (0%) non fanno una riga «IVA 0%» quando ce n'è un'altra", () => {
    const r = righeRiepilogoIva({ righe: [riga(1000, 22), riga(500, 0)], subtotal: 1500, discount_amount: 0, total: 1720, discount_percent: 0 });
    expect(r.righeIva).toEqual([{ aliquota: 22, valore: 220 }]);
  });

  it("tutte esenti: una riga a 0,00", () => {
    const r = righeRiepilogoIva({ righe: [riga(300, 0)], subtotal: 300, discount_amount: 0, total: 300, discount_percent: 0 });
    expect(r.righeIva).toEqual([{ aliquota: 0, valore: 0 }]);
  });

  it("le righe opzionali non entrano", () => {
    const r = righeRiepilogoIva({ righe: [riga(1000, 22), riga(900, 10, { is_optional: true })], subtotal: 1000, discount_amount: 0, total: 1220, discount_percent: 0 });
    expect(r.righeIva).toEqual([{ aliquota: 22, valore: 220 }]);
  });

  it("una riga nascosta nel PDF resta nell'IVA del suo scaglione: 1.000 € al 10% visibili + 1.000 € al 22% nascosti", () => {
    // Il totale comprende la riga nascosta (100 + 220 = 320 di IVA): le righe IVA le dicono entrambe.
    const r = righeRiepilogoIva({
      righe: [riga(1000, 10), riga(1000, 22, { mostra_nel_pdf: false })], subtotal: 2000, discount_amount: 0, total: 2320, discount_percent: 0,
    });
    expect(r.righeIva).toEqual([{ aliquota: 10, valore: 100 }, { aliquota: 22, valore: 220 }]);
    expect(r.ivaToShow).toBe(320);
  });

  it("sul mezzo centesimo l'IVA di un'aliquota si arrotonda in su, come il database", () => {
    // Importi per aliquota: 4,95 × 10% = 0,495 → 0,50 ; 0,50 × 22% = 0,11.
    const r = righeRiepilogoIva({ righe: [riga(4.95, 10), riga(0.5, 22)], subtotal: 5.45, discount_amount: 0, total: 6.06, discount_percent: 0 });
    expect(r.righeIva).toEqual([{ aliquota: 10, valore: 0.5 }, { aliquota: 22, valore: 0.11 }]);
    expect(somma2([r.subTotShown, -r.scontoShown, r.ivaToShow])).toBe(r.totShown);
  });

  it("preventivo vuoto o senza righe vendute: zero, mai NaN", () => {
    const r = righeRiepilogoIva({ righe: [], subtotal: null, discount_amount: undefined, total: null, discount_percent: null });
    expect(r).toMatchObject({ subTotShown: 0, scontoShown: 0, totShown: 0, ivaToShow: 0 });
    expect(r.righeIva).toEqual([{ aliquota: null, valore: 0 }]);
  });

  it("esente con sconto e scarto di un centesimo: l'IVA non va sotto zero, lo scarto passa nello sconto", () => {
    const r = righeRiepilogoIva({ righe: [riga(100, 0)], subtotal: 100, discount_amount: 10.01, total: 89.99, discount_percent: 10 });
    expect(r.ivaToShow).toBe(0);
    expect(r.scontoShown).toBe(10.01);
    const r2 = righeRiepilogoIva({ righe: [riga(100, 0)], subtotal: 100, discount_amount: 10, total: 89.99, discount_percent: 10 });
    expect(r2.ivaToShow).toBe(0);
    expect(r2.scontoShown).toBe(10.01);
    expect(r2.subTotShown - r2.scontoShown + r2.ivaToShow).toBeCloseTo(r2.totShown, 10);
  });
});

describe("righeRiepilogoIva: contro il database (aritmetica esatta)", () => {
  function generatore(seme: number) {
    let a = seme;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("6.000 preventivi casuali a più aliquote: ogni riga IVA è quella vera, e il documento torna", () => {
    const rnd = generatore(990);
    let verificati = 0;
    for (let i = 0; i < 6000; i++) {
      const righe: RigaClient[] = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => ({
        quantity: Math.round(rnd() * 5000) / 100, unit_price: Math.round(rnd() * 200000) / 100,
        discount_percent: rnd() < 0.5 ? 0 : Math.round(rnd() * 3000) / 100, vat_rate: [4, 10, 22][Math.floor(rnd() * 3)], is_optional: rnd() < 0.1,
      }));
      if (righe.every((r) => r.is_optional)) continue;
      const sconto = rnd() < 0.6 ? 0 : Math.round(rnd() * 2000) / 100;
      const t = totaliDb(righe, sconto);
      const riepilogo = righeRiepilogoIva({
        righe: righe.map((r) => ({ line_total: inNumero(lineTotalDb(r)), vat_rate: r.vat_rate, is_optional: r.is_optional })),
        subtotal: inNumero(t.subtotal), discount_amount: inNumero(t.discount_amount), total: inNumero(t.total), discount_percent: sconto,
      });
      // IVA vera per aliquota, dal database.
      const fattore = diff(uno, diviso100(dec(sconto)));
      const basi = new Map<number, ReturnType<typeof dec>>();
      for (const r of righe) {
        const s = rigaSalvata(r);
        if (s.is_optional) continue;
        const k = inNumero(s.vat_rate);
        basi.set(k, somma(basi.get(k) ?? dec(0), lineTotalDb(r)));
      }
      const vere = [...basi].map(([aliquota, base]) => ({ aliquota, valore: inNumero(arrotonda(per(diviso100(per(base, dec(aliquota))), fattore), 2)) }))
        .filter((x) => x.valore > 0).sort((a, b) => a.aliquota - b.aliquota);
      const stampate = riepilogo.righeIva.filter((x) => x.valore > 0).sort((a, b) => (a.aliquota ?? 0) - (b.aliquota ?? 0));
      expect(stampate).toEqual(vere);
      expect(somma2(riepilogo.righeIva.map((x) => x.valore))).toBe(riepilogo.ivaToShow);
      expect(inNumero(t.vat_amount)).toBe(riepilogo.ivaToShow);
      expect(Math.round((riepilogo.subTotShown - riepilogo.scontoShown + riepilogo.ivaToShow) * 100) / 100).toBe(riepilogo.totShown);
      verificati += 1;
    }
    expect(verificati).toBeGreaterThan(5000);
  }, 30000);

  it("il PDF e la pagina arrotondano allo stesso modo: arrotondaComePostgres è round2", () => {
    const rnd = generatore(5);
    for (let i = 0; i < 20000; i++) {
      const x = (rnd() - 0.3) * (rnd() < 0.5 ? 10 : 100000);
      expect(arrotondaComePostgres(x)).toBe(round2(x));
    }
    // I mezzi centesimi veri.
    for (const [x, atteso] of [[0.005, 0.01], [1.005, 1.01], [4350.645, 4350.65], [-0.005, -0.01], [2.675, 2.68]] as const) {
      expect(arrotondaComePostgres(x)).toBe(atteso);
    }
  });

  it("ivaPerAliquota: lo sconto globale entra come nel database, all'ultimo", () => {
    expect(ivaPerAliquota({ "22": 3126 }, 5)).toEqual({ "22": 653.33 });
    // Mezzo centesimo esatto: 43.506,45 × 10% = 4.350,645 → 4.350,65 (il database arrotonda in su).
    expect(ivaPerAliquota({ "10": 43506.45 }, 0)).toEqual({ "10": 4350.65 });
  });
});

describe("generate-quote-pdf usa il riepilogo sulle righe giuste", () => {
  const pdf = readFileSync("supabase/functions/generate-quote-pdf/index.ts", "utf8");

  it("passa TUTTE le righe (anche quelle nascoste nel PDF), non solo quelle in tabella", () => {
    expect(pdf).toContain('import { righeRiepilogoIva } from "../_shared/riepilogoIvaPreventivo.ts";');
    expect(pdf).toContain("righePerIva = itemsRes.data ?? [];");
    expect(pdf).toMatch(/righeRiepilogoIva\(\{\s+righe: righePerIva,/);
    // Le righe IVA stampate sono quelle del riepilogo, non un conto rifatto in pagina.
    expect(pdf).toContain("for (const r of riepilogoIva.righeIva)");
    expect(pdf).not.toMatch(/ivaBreakdown\[rate\]/);
  });
});
