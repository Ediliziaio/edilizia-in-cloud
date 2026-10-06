/**
 * Il preventivo edile si calcola al centesimo, come si stampa (06/10/2026).
 *
 * Il PDF scrive ogni importo di riga, ogni subtotale, l'imponibile, lo sconto, l'IVA e il
 * totale, ciascuno arrotondato da solo ai centesimi. I conti, invece, restavano in
 * virgola mobile senza arrotondare mai: su un preventivo con quantità decimali (12,5 mq ×
 * 33,33 €), sconti in percentuale o prezzi a tre decimali i numeri stampati non
 * tornavano di un centesimo («Imponibile netto 1,79 + IVA 0,39 = Totale 2,19»).
 * Ora ogni riga è arrotondata ai centesimi e tutto il resto è somma e differenza di
 * centesimi: quello che il PDF stampa si somma, riga per riga fino al totale.
 *
 * La regola: imponibile netto = lordo scontato, arrotondato; totale = lo stesso importo con l'IVA,
 * arrotondato (così ogni cifra di totale è raggiungibile, come chiede lo «sconto veloce» che arriva a
 * una cifra tonda); IVA = totale − imponibile, sempre entro 1 centesimo da aliquota × imponibile e
 * identica a quella stretta quando non c'è sconto.
 */
import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
import * as bagni from "@/lib/bagni/calcoli";
import * as tetti from "@/lib/tetti/calcoli";
import * as climatizzazione from "@/lib/climatizzazione/calcoli";
import * as elettrico from "@/lib/elettrico/calcoli";
import * as termoidraulico from "@/lib/termoidraulico/calcoli";
import * as pavimenti from "@/lib/pavimenti/calcoli";
import * as piscine from "@/lib/piscine/calcoli";
import * as ristrutturazione from "@/lib/ristrutturazione/calcoli";
import { formatCurrency } from "@/lib/formatters";
import { centesimi } from "@/lib/preventivi/arrotondamento";

const MODULI = [
  ["bagni", bagni], ["tetti", tetti], ["climatizzazione", climatizzazione], ["elettrico", elettrico],
  ["termoidraulico", termoidraulico], ["pavimenti", pavimenti], ["piscine", piscine], ["ristrutturazione", ristrutturazione],
] as const;

/** Come `formatCurrency` (stesse opzioni), ma creato una volta sola: il ciclo lungo non rifà il formattatore a ogni importo. */
const FORMATO_STAMPA = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
const lettura = (testo: string): number => Math.round(parseFloat(testo.replace(/[^\d,-]/g, "").replace(",", ".")) * 100);
/** I centesimi interi che il PDF stampa per un importo: le cifre vere di `formatCurrency` («1.234,56 €» → 123456). */
const stampati = (euro: number): number => lettura(FORMATO_STAMPA.format(euro));

const riga = (cap: string, q: number, p: number, sc = 0) => ({
  capitolo_nome: cap, quantita: q, prezzo_unitario: p, sconto_pct: sc, costo_materiali: 0, costo_manodopera: 0,
});

describe.each(MODULI)("%s: i numeri stampati tornano al centesimo", (_nome, calc) => {
  // Un articolo da 1,99 € con sconto 10% e IVA 22%:
  //   netto 1,99 × 0,9 = 1,791 → 1,79 · totale 1,791 × 1,22 = 2,18502 → 2,19 · IVA 2,19 − 1,79 = 0,40.
  // Senza arrotondare il PDF stampava «Imponibile 1,79 + IVA 0,39 = Totale 2,19» (0,39 era l'IVA arrotondata da sola):
  // non si sommava. Ora 1,79 + 0,40 = 2,19, e lo 0,40 dista meno di un centesimo da 22% × 1,79 = 0,3938.
  it("1,99 € − 10% + IVA 22%: imponibile 1,79, IVA 0,40, totale 2,19", () => {
    const t = calc.calcTotaliComputo([riga("A", 1, 1.99)], { sconto_pct: 10, iva_pct: 22 });
    expect(t.imponibile).toBe(1.79);
    expect(t.iva).toBe(0.4);
    expect(t.totale).toBe(2.19);
  });

  // Tre righe da 12,5 mq × 33,33 € = 416,625 → 416,63 l'una (a metà si arrotonda per eccesso, come la stampa);
  // lordo 1.249,89; sconto 5%: netto 1.249,89 × 0,95 = 1.187,3955 → 1.187,40;
  // totale 1.187,3955 × 1,22 = 1.448,62251 → 1.448,62; IVA 1.448,62 − 1.187,40 = 261,22 (22% di 1.187,40 sono 261,228).
  it("tre righe da 12,5 mq × 33,33 €, sconto 5%, IVA 22%", () => {
    const t = calc.calcTotaliComputo([riga("A", 12.5, 33.33), riga("A", 12.5, 33.33), riga("B", 12.5, 33.33)], { sconto_pct: 5, iva_pct: 22 });
    expect(calc.calcRigaImporto({ quantita: 12.5, prezzo_unitario: 33.33, sconto_pct: 0 })).toBe(416.63);
    expect(t.imponibileLordo).toBe(1249.89);
    expect(t.imponibile).toBe(1187.4);
    expect(t.iva).toBe(261.22);
    expect(t.totale).toBe(1448.62);
    expect(t.perCapitolo.map((c) => c.imponibile)).toEqual([833.26, 416.63]);
  });

  // 0,333 × 3 € = 0,999 → 1,00; sconto di riga 33,33% su 30 € = 20,001 → 20,00; prezzo scritto a mano a tre decimali.
  it("quantità e sconti che non cadono sui centesimi", () => {
    expect(calc.calcRigaImporto({ quantita: 0.333, prezzo_unitario: 3, sconto_pct: 0 })).toBe(1);
    expect(calc.calcRigaImporto({ quantita: 3, prezzo_unitario: 10, sconto_pct: 33.33 })).toBe(20);
    const t = calc.calcTotaliComputo([riga("A", 1, 0)], { sconto_pct: 0, iva_pct: 10, prezzo_manuale: 1234.567 });
    expect(t.imponibileLordo).toBe(1234.57);
    expect(t.iva).toBe(123.46); // 1.234,57 × 0,10 = 123,457
    expect(t.totale).toBe(1358.03);
  });

  it("sconto 100% e computo vuoto: zero esatto, mai «-0»", () => {
    const tutto = calc.calcTotaliComputo([riga("A", 3, 19.99)], { sconto_pct: 100, iva_pct: 22 });
    expect([tutto.imponibile, tutto.iva, tutto.totale].every((x) => x === 0 && !Object.is(x, -0))).toBe(true);
    const vuoto = calc.calcTotaliComputo([], { sconto_pct: 5, iva_pct: 22 });
    expect([vuoto.imponibile, vuoto.iva, vuoto.totale].every((x) => x === 0 && !Object.is(x, -0))).toBe(true);
  });

  // Su 600 preventivi a caso (quantità e sconti decimali) ogni numero che il PDF stampa deve tornare:
  // righe → subtotali → imponibile lordo; lordo − sconto = imponibile netto; netto + IVA = totale.
  it("600 preventivi a caso: righe, capitoli, sconto, IVA e totale si sommano a centesimi esatti", () => {
    let seme = 6102026;
    const caso = () => { seme = (seme * 1664525 + 1013904223) % 4294967296; return seme / 4294967296; };
    const scegli = <T,>(a: readonly T[]) => a[Math.floor(caso() * a.length)];
    let nonTornano = 0;
    for (let k = 0; k < 600; k++) {
      const rs = Array.from({ length: 1 + Math.floor(caso() * 12) }, () =>
        riga(scegli(["A", "B", "C"]), scegli([1, 2, 3, 7, 0.5, 12.5, 33.33, 0.333, 2.25, 100]), Math.round(caso() * 400000) / 100, scegli([0, 0, 5, 10, 12.5, 3])));
      const sconto = scegli([0, 0, 3, 5, 7.5, 10]);
      const iva = scegli([4, 10, 22]);
      const t = calc.calcTotaliComputo(rs, { sconto_pct: sconto, iva_pct: iva });
      const righeStampate = rs.reduce((s, r) => s + stampati(calc.calcRigaImporto(r)), 0);
      const lordo = stampati(t.imponibileLordo);
      const capitoli = t.perCapitolo.reduce((s, c) => s + stampati(c.imponibile), 0);
      const scontoStampato = stampati(t.imponibileLordo - t.imponibile);
      const ok = righeStampate === lordo
        && capitoli === lordo
        && lordo - scontoStampato === stampati(t.imponibile)
        && stampati(t.imponibile) + stampati(t.iva) === stampati(t.totale);
      if (!ok) nonTornano += 1;
      // Il totale è l'importo scontato con l'IVA, arrotondato; l'IVA è la differenza e dista al più 1 centesimo
      // da aliquota × imponibile (senza sconto, o con uno che cade sui centesimi, è esattamente quella).
      const nettoEsatto = (lordo / 100) * (1 - sconto / 100);
      expect(stampati(t.totale), `totale k=${k}`).toBe(stampati(nettoEsatto * (1 + iva / 100)));
      const ivaStretta = stampati((stampati(t.imponibile) / 100) * iva / 100);
      expect(Math.abs(stampati(t.iva) - ivaStretta), `IVA k=${k}`).toBeLessThanOrEqual(1);
      if (sconto === 0) expect(stampati(t.iva), `IVA senza sconto k=${k}`).toBe(ivaStretta);
    }
    expect(nonTornano).toBe(0);
  });
});

describe("l'arrotondamento è quello della stampa", () => {
  it("l'importo di riga arrotondato si stampa come l'importo grezzo: stessa cifra, mai un centesimo di scarto", () => {
    let seme = 99;
    const caso = () => { seme = (seme * 1664525 + 1013904223) % 4294967296; return seme / 4294967296; };
    for (let k = 0; k < 3000; k++) {
      const q = scegliDecimali(caso, [1, 2, 3, 0.5, 12.5, 2.25, 0.333, 7.75, 120.125]);
      const p = Math.round(caso() * 2_000_000) / 100;
      const sc = [0, 5, 10, 12.5, 33.33][Math.floor(caso() * 5)];
      const grezzo = q * p * (1 - sc / 100);
      const calcolato = climatizzazione.calcRigaImporto({ quantita: q, prezzo_unitario: p, sconto_pct: sc });
      expect(formatCurrency(calcolato), `q=${q} p=${p} sc=${sc}`).toBe(formatCurrency(grezzo));
    }
  });

  it("centesimi(): coincide con la stampa su 100.000 importi, compresi quelli a metà centesimo che il binario vede appena sotto", () => {
    let seme = 4242;
    const caso = () => { seme = (seme * 1664525 + 1013904223) % 4294967296; return seme / 4294967296; };
    for (let k = 0; k < 100000; k++) {
      const x = (Math.round(caso() * 200_000_000) / 1000) * (1 - [0, 0.05, 0.1, 0.125, 0.3333][Math.floor(caso() * 5)]);
      expect(centesimi(x), String(x)).toBe(stampati(x));
    }
    // La stessa cosa con la funzione vera dell'app, su un campione.
    for (const x of [15382.035, 22245.434999999998, 1.005, 2.675, 0.125, 416.625, 1187.3955, 261.228]) expect(lettura(formatCurrency(x)), String(x)).toBe(centesimi(x));
    // 15.382,035: a metà. Il binario lo vede sotto (toFixed dà 15.382,03), la stampa dice 15.382,04, e il calcolo con lei.
    expect(centesimi(15382.035)).toBe(1538204);
    // 22.245,434999999998: sotto il mezzo centesimo davvero, per rumore del calcolo: la stampa dice ,43 e il calcolo con lei.
    expect(centesimi(22245.434999999998)).toBe(2224543);
    expect([Number.NaN, Number.POSITIVE_INFINITY, null, undefined, "abc", {}].map(centesimi)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("i valori a metà centesimo si arrotondano per eccesso, e il segno meno non resta attaccato a uno zero", () => {
    expect(climatizzazione.calcRigaImporto({ quantita: 1, prezzo_unitario: 0.125, sconto_pct: 0 })).toBe(0.13);
    expect(climatizzazione.calcRigaImporto({ quantita: 2, prezzo_unitario: 0.0024, sconto_pct: 0 })).toBe(0);
    expect(Object.is(climatizzazione.calcRigaImporto({ quantita: 2, prezzo_unitario: 0.0024, sconto_pct: 0 }), -0)).toBe(false);
  });
});

function scegliDecimali(caso: () => number, valori: readonly number[]): number {
  return valori[Math.floor(caso() * valori.length)];
}
