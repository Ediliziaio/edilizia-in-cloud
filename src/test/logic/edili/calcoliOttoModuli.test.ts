/**
 * Controllo di correttezza dei calcoli degli otto preventivatori edili (06/10/2026).
 *
 * Gli otto `lib/<modulo>/calcoli.ts` sono copie: le stesse prove girano su tutte. I numeri
 * attesi degli scenari sono fatti a mano, al centesimo (ogni riga arrotondata, poi somme: vedi
 * arrotondamentoAlCentesimo.test.ts) e spiegati nel commento di ogni caso. Un oracolo SCRITTO A
 * PARTE in aritmetica esatta (frazioni con BigInt, nessuna funzione del progetto) controlla che
 * sui preventivi a caso il risultato stia dentro la busta teorica degli arrotondamenti.
 */
import { describe, expect, it } from "vitest";
import * as bagni from "@/lib/bagni/calcoli";
import * as tetti from "@/lib/tetti/calcoli";
import * as climatizzazione from "@/lib/climatizzazione/calcoli";
import * as elettrico from "@/lib/elettrico/calcoli";
import * as termoidraulico from "@/lib/termoidraulico/calcoli";
import * as pavimenti from "@/lib/pavimenti/calcoli";
import * as piscine from "@/lib/piscine/calcoli";
import * as ristrutturazione from "@/lib/ristrutturazione/calcoli";

const MODULI = [
  ["bagni", bagni],
  ["tetti", tetti],
  ["climatizzazione", climatizzazione],
  ["elettrico", elettrico],
  ["termoidraulico", termoidraulico],
  ["pavimenti", pavimenti],
  ["piscine", piscine],
  ["ristrutturazione", ristrutturazione],
] as const;

// ─── L'oracolo: frazioni esatte, niente float ───────────────────────────────────
type Frac = { n: bigint; d: bigint };
const mcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a || 1n; };
const frac = (n: bigint, d: bigint = 1n): Frac => { const g = mcd(n, d); return d < 0n ? { n: -n / g, d: -d / g } : { n: n / g, d: d / g }; };
const per = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
const piu = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const meno = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
/** Un decimale scritto come testo («33.33», «12.5») → frazione esatta. */
const dec = (testo: string): Frac => {
  const [intera, decimali = ""] = testo.split(".");
  return frac(BigInt(intera + decimali), 10n ** BigInt(decimali.length));
};
const comeNumero = (f: Frac) => Number(f.n) / Number(f.d);
const UNO = frac(1n);

interface RigaTesto { cap: string; q: string; p: string; sc: string; cm?: string; cmo?: string }
const righe = (rs: RigaTesto[]) => rs.map((r) => ({
  capitolo_nome: r.cap, quantita: Number(r.q), prezzo_unitario: Number(r.p), sconto_pct: Number(r.sc),
  costo_materiali: Number(r.cm ?? "0"), costo_manodopera: Number(r.cmo ?? "0"),
}));

/** Il conto fatto dall'oracolo: lordo, netto, IVA, totale, costi. */
function oracolo(rs: RigaTesto[], scontoGlobale: string, iva: string, manuale?: string) {
  const importoRiga = (r: RigaTesto) => per(per(dec(r.q), dec(r.p)), meno(UNO, per(dec(r.sc), frac(1n, 100n))));
  const somma = rs.reduce((s, r) => piu(s, importoRiga(r)), frac(0n));
  const lordo = manuale && dec(manuale).n > 0n ? dec(manuale) : somma;
  const netto = per(lordo, meno(UNO, per(dec(scontoGlobale), frac(1n, 100n))));
  const ivaEur = per(netto, per(dec(iva), frac(1n, 100n)));
  const costo = rs.reduce((s, r) => piu(s, per(piu(dec(r.cm ?? "0"), dec(r.cmo ?? "0")), dec(r.q))), frac(0n));
  return {
    somma: comeNumero(somma), lordo: comeNumero(lordo), netto: comeNumero(netto),
    iva: comeNumero(ivaEur), totale: comeNumero(piu(netto, ivaEur)), costo: comeNumero(costo),
  };
}
const vicino = (ottenuto: number, atteso: number, tolleranza = 1e-9 * Math.max(1, Math.abs(atteso))) => expect(Math.abs(ottenuto - atteso)).toBeLessThanOrEqual(tolleranza);
/** Un importo scritto al centesimo: nessuna frazione di centesimo. */
const aCentesimi = (x: number) => expect(Math.abs(x * 100 - Math.round(x * 100))).toBeLessThan(1e-6);

describe.each(MODULI)("calcoli di %s contro l'oracolo esatto", (_nome, calc) => {
  // 1. Semplice: 2 × 1.000,00 + 3 × 250,00 + 1 × 99,90 = 2.000 + 750 + 99,90 = 2.849,90;
  //    IVA 22% = 626,978 → 626,98; totale = 2.849,90 + 626,98 = 3.476,88.
  it("scenario semplice, IVA 22%", () => {
    const rs = [{ cap: "A", q: "2", p: "1000", sc: "0" }, { cap: "A", q: "3", p: "250", sc: "0" }, { cap: "B", q: "1", p: "99.9", sc: "0" }];
    const t = calc.calcTotaliComputo(righe(rs), { sconto_pct: 0, iva_pct: 22 });
    expect(t.imponibile).toBe(2849.9);
    expect(t.iva).toBe(626.98);
    expect(t.totale).toBe(3476.88);
    vicino(t.totale, oracolo(rs, "0", "22").totale, 0.005);
  });

  // 2. Sconto di riga 10% su 10 × 33,33 = 333,30 → 299,97; 4 × 125,50 = 502,00.
  //    Lordo 801,97; sconto globale 5% → 761,8715 → 761,87; IVA 10% = 76,187 → 76,19; totale 838,06.
  it("sconto di riga + sconto globale + IVA 10%", () => {
    const rs = [{ cap: "A", q: "10", p: "33.33", sc: "10" }, { cap: "A", q: "4", p: "125.5", sc: "0" }];
    const t = calc.calcTotaliComputo(righe(rs), { sconto_pct: 5, iva_pct: 10 });
    expect(t.imponibileLordo).toBe(801.97);
    expect(t.imponibile).toBe(761.87);
    expect(t.iva).toBe(76.19);
    expect(t.totale).toBe(838.06);
    expect(calc.calcRigaImporto(righe(rs)[0])).toBe(299.97);
  });

  // 3. IVA 0, 4, 5, 10, 22 e fuori elenco (21, 13,5) su 1.000 € netti: l'IVA è quella scritta, mai una di riserva.
  it.each([
    [0, 1000], [4, 1040], [5, 1050], [10, 1100], [22, 1220], [21, 1210], [13.5, 1135],
  ])("IVA %s%% su 1.000 € → totale %s", (iva, totale) => {
    const t = calc.calcTotaliComputo(righe([{ cap: "A", q: "1", p: "1000", sc: "0" }]), { sconto_pct: 0, iva_pct: iva });
    vicino(t.iva, totale - 1000);
    vicino(t.totale, totale);
  });

  // 4. Prezzo a mano 7.500 con le righe a 0 € e con righe che sommano 2.400: comanda il prezzo scritto.
  //    7.500 − 10% = 6.750; IVA 10% = 675; totale 7.425. Il margine è prezzo − costi di TUTTE le righe.
  it("prezzo scritto a mano: prende il posto delle righe, sconto e IVA sopra", () => {
    const aZero = righe([{ cap: "A", q: "2", p: "0", sc: "0", cm: "500", cmo: "250" }]);
    const t = calc.calcTotaliComputo(aZero, { sconto_pct: 10, iva_pct: 10, prezzo_manuale: 7500 });
    expect(t.prezzoManuale).toBe(true);
    vicino(t.imponibileLordo, 7500);
    vicino(t.imponibile, 6750);
    vicino(t.totale, 7425);
    vicino(t.costoTot, 1500); // (500 + 250) × 2
    vicino(t.margineEur as number, 5250); // 6.750 − 1.500
    const conPrezzi = righe([{ cap: "A", q: "1", p: "1500", sc: "0" }, { cap: "A", q: "1", p: "900", sc: "0" }]);
    const t2 = calc.calcTotaliComputo(conPrezzi, { sconto_pct: 0, iva_pct: 22, prezzo_manuale: 3000 });
    vicino(t2.sommaVoci, 2400);
    vicino(t2.imponibileLordo, 3000);
  });

  // 5. Quantità decimali: 3 × 33,33 = 99,99; 0,5 × 1.234,56 = 617,28; 12,5 × 33,33 = 416,625 → 416,63;
  //    0,333 × 3 = 0,999 → 1,00. L'importo di riga è al centesimo, come si stampa.
  it("quantità e prezzi con decimali", () => {
    const casi: Array<[string, string, number]> = [["3", "33.33", 99.99], ["0.5", "1234.56", 617.28], ["12.5", "33.33", 416.63], ["0.333", "3", 1]];
    for (const [q, p, atteso] of casi) {
      expect(calc.calcRigaImporto({ quantita: Number(q), prezzo_unitario: Number(p), sconto_pct: 0 })).toBe(atteso);
    }
    // Tre decimali sulla quantità, tre sul prezzo: 2,345 × 17,895 = 35,79 + 0,345 × 17,895 (6,173775) = 41,963775 → 41,96.
    expect(calc.calcRigaImporto({ quantita: 2.345, prezzo_unitario: 17.895, sconto_pct: 0 })).toBe(41.96);
  });

  // 6. Computo vuoto e voci a 0 €: tutto zero, nessun margine, niente NaN.
  it("computo vuoto e righe a 0 €", () => {
    for (const rs of [[], righe([{ cap: "A", q: "5", p: "0", sc: "0" }, { cap: "B", q: "0", p: "100", sc: "0" }])]) {
      const t = calc.calcTotaliComputo(rs, { sconto_pct: 10, iva_pct: 22 });
      expect([t.imponibile, t.iva, t.totale, t.imponibileLordo, t.sommaVoci].every((x) => x === 0)).toBe(true);
      expect(t.margineEur).toBeNull();
      expect(t.marginePct).toBeNull();
      expect(t.costiCompleti).toBe(false);
      expect(t.prezzoManuale).toBe(false);
    }
    expect(calc.calcTotaliComputo([], { sconto_pct: 0, iva_pct: 22 }).perCapitolo).toEqual([]);
  });

  // 7. Valori sporchi: mai NaN, mai Infinity, mai «-0»; i negativi valgono 0; lo sconto oltre il 100% vale 100%.
  it("valori sporchi: null, undefined, NaN, negativi, sconto fuori scala", () => {
    const sporche = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, -5, "abc", "", {}] as unknown[];
    for (const v of sporche) {
      const importo = calc.calcRigaImporto({ quantita: v as number, prezzo_unitario: 100, sconto_pct: 0 });
      expect(Number.isFinite(importo) && importo >= 0 && !Object.is(importo, -0)).toBe(true);
      const t = calc.calcTotaliComputo(
        [{ capitolo_nome: "A", quantita: v as number, prezzo_unitario: v as number, sconto_pct: v as number, costo_materiali: v as number, costo_manodopera: v as number }],
        { sconto_pct: v as number, iva_pct: v as number, prezzo_manuale: v as number },
      );
      for (const x of [t.imponibile, t.iva, t.totale, t.imponibileLordo, t.sommaVoci, t.costoTot]) {
        expect(Number.isFinite(x) && !Object.is(x, -0)).toBe(true);
      }
    }
    expect(calc.calcRigaImporto({ quantita: 2, prezzo_unitario: 50, sconto_pct: 150 })).toBe(0);
    expect(calc.calcRigaImporto({ quantita: 2, prezzo_unitario: 50, sconto_pct: -20 })).toBe(100);
    expect(calc.calcRigaImporto({ quantita: -2, prezzo_unitario: 50, sconto_pct: 0 })).toBe(0);
    // Sconto globale oltre il 100%: il preventivo non diventa negativo.
    const t = calc.calcTotaliComputo(righe([{ cap: "A", q: "1", p: "100", sc: "0" }]), { sconto_pct: 250, iva_pct: 22 });
    expect(t.imponibile).toBe(0);
    expect(t.totale).toBe(0);
  });

  // 8. Capitoli: i subtotali sommano al totale delle voci, e il capitolo vuoto è «Generale».
  it("più capitoli: Σ subtotali = somma delle voci; nome vuoto = «Generale»", () => {
    const rs = [
      { cap: "Demolizioni", q: "10", p: "12.34", sc: "0" }, { cap: "Impianti", q: "3", p: "450", sc: "5" },
      { cap: "", q: "1", p: "88.8", sc: "0" }, { cap: "Demolizioni", q: "0.5", p: "99", sc: "0" },
    ];
    const t = calc.calcTotaliComputo(righe(rs), { sconto_pct: 0, iva_pct: 10 });
    expect(t.perCapitolo.map((c) => c.nome)).toEqual(["Demolizioni", "Impianti", "Generale"]);
    expect(t.perCapitolo.map((c) => c.voci)).toEqual([2, 1, 1]);
    const somma = t.perCapitolo.reduce((s, c) => s + c.imponibile, 0);
    vicino(somma, t.sommaVoci, 1e-9);
    vicino(t.sommaVoci, oracolo(rs, "0", "10").somma, 0.005 * rs.length);
    // 10 × 12,34 = 123,40; 0,5 × 99 = 49,50 → Demolizioni 172,90.
    expect(t.perCapitolo[0].imponibile).toBe(172.9);
    // 3 × 450 − 5% = 1.282,50.
    expect(t.perCapitolo[1].imponibile).toBe(1282.5);
    // Generale 88,80; somma di tutto 1.544,20.
    expect(t.perCapitolo[2].imponibile).toBe(88.8);
    expect(t.sommaVoci).toBe(1544.2);
  });

  // 9. 200 preventivi a caso (seme fisso): importi al centesimo, totale = imponibile + IVA, Σ capitoli = lordo, e il
  //    risultato sta dentro la busta degli arrotondamenti rispetto all'oracolo esatto (mezzo centesimo per ogni riga,
  //    più sconto, IVA e totale).
  it("invarianti e oracolo su 200 preventivi a caso", () => {
    let seme = 20261006;
    const caso = () => { seme = (seme * 1664525 + 1013904223) % 4294967296; return seme / 4294967296; };
    const scegli = <T,>(a: readonly T[]) => a[Math.floor(caso() * a.length)];
    for (let k = 0; k < 200; k++) {
      const rs: RigaTesto[] = Array.from({ length: 1 + Math.floor(caso() * 12) }, () => ({
        cap: scegli(["A", "B", "C", ""]),
        q: scegli(["1", "2", "3", "7", "0.5", "12.5", "33.33", "0.333", "100"]),
        p: (Math.round(caso() * 500000) / 100).toFixed(2),
        sc: scegli(["0", "0", "0", "5", "10", "12.5", "100"]),
        cm: scegli(["0", "10", "55.5"]), cmo: scegli(["0", "20", "7.25"]),
      }));
      const sc = scegli(["0", "0", "3", "7.5", "10", "100"]);
      const iva = scegli(["0", "4", "10", "22"]);
      const manuale = scegli([undefined, undefined, "5000", "0"]);
      const t = calc.calcTotaliComputo(righe(rs), { sconto_pct: Number(sc), iva_pct: Number(iva), prezzo_manuale: manuale ? Number(manuale) : null });
      const o = oracolo(rs, sc, iva, manuale);
      const busta = 0.005 * (rs.length + 3) + 1e-9;
      vicino(t.imponibileLordo, o.lordo, 0.005 * rs.length + 1e-9);
      vicino(t.imponibile, o.netto, busta);
      vicino(t.iva, o.iva, busta);
      vicino(t.totale, o.totale, busta);
      vicino(t.costoTot, o.costo, 1e-9 * Math.max(1, o.costo));
      for (const x of [t.imponibileLordo, t.imponibile, t.iva, t.totale, t.sommaVoci]) aCentesimi(x);
      vicino(t.totale, t.imponibile + t.iva, 1e-9 * Math.max(1, t.totale));
      vicino(t.perCapitolo.reduce((s, c) => s + c.imponibile, 0), t.sommaVoci, 1e-9 * Math.max(1, t.sommaVoci));
    }
  });

  // 10. Importi enormi: restano finiti e proporzionali.
  it("importi enormi", () => {
    const t = calc.calcTotaliComputo(righe([{ cap: "A", q: "1000000", p: "1000000", sc: "0" }]), { sconto_pct: 0, iva_pct: 22 });
    expect(t.imponibile).toBe(1e12);
    expect(t.totale).toBe(1.22e12);
  });

  // 11. Margine di riga: costo = (materiali + manodopera) × quantità; riga venduta senza costo → nessun margine, mai il 100%.
  it("margine di riga e costi incompleti", () => {
    // 5 × 100 = 500 di importo; costo (30 + 20) × 5 = 250; margine 250 = 50%.
    const m = calc.calcMargineRiga({ quantita: 5, prezzo_unitario: 100, sconto_pct: 0, costo_materiali: 30, costo_manodopera: 20 });
    expect(m.margineEur).toBe(250);
    expect(m.marginePct).toBe(50);
    const senzaCosto = calc.calcMargineRiga({ quantita: 5, prezzo_unitario: 100, sconto_pct: 0, costo_materiali: 0, costo_manodopera: 0 });
    expect(senzaCosto).toEqual({ margineEur: null, marginePct: null });
    // Una riga a 0 € con un costo: margine negativo ma esiste, la percentuale no (importo 0).
    const inPerdita = calc.calcMargineRiga({ quantita: 2, prezzo_unitario: 0, sconto_pct: 0, costo_materiali: 10, costo_manodopera: 0 });
    expect(inPerdita).toEqual({ margineEur: -20, marginePct: null });
    // Nel totale: una sola riga venduta senza costo toglie il margine a tutto il preventivo.
    const t = calc.calcTotaliComputo(
      righe([{ cap: "A", q: "1", p: "1000", sc: "0", cm: "400" }, { cap: "A", q: "1", p: "200", sc: "0" }]),
      { sconto_pct: 0, iva_pct: 22 },
    );
    expect(t.righeSenzaCosto).toBe(1);
    expect(t.margineEur).toBeNull();
    // Col prezzo scritto a mano, una riga con quantità e senza costo conta come «senza costo» anche a 0 €.
    const manuale = calc.calcTotaliComputo(righe([{ cap: "A", q: "2", p: "0", sc: "0" }]), { sconto_pct: 0, iva_pct: 22, prezzo_manuale: 900 });
    expect(manuale.righeSenzaCosto).toBe(1);
    expect(manuale.margineEur).toBeNull();
  });

  it("calcPrezzoVoce: (materiali + manodopera) × (1 + ricarico%), mai negativo", () => {
    // (40 + 60) × 1,2 = 120; (12,5 + 7,5) × 1,35 = 27.
    expect(calc.calcPrezzoVoce({ costo_materiali: 40, costo_manodopera: 60, ricarico_pct: 20 })).toBeCloseTo(120, 9);
    expect(calc.calcPrezzoVoce({ costo_materiali: 12.5, costo_manodopera: 7.5, ricarico_pct: 35 })).toBeCloseTo(27, 9);
    expect(calc.calcPrezzoVoce({ costo_materiali: -10, costo_manodopera: 5, ricarico_pct: -50 })).toBe(5);
    expect(calc.calcPrezzoVoce({ costo_materiali: Number.NaN, costo_manodopera: 5, ricarico_pct: 10 })).toBeCloseTo(5.5, 9);
  });
});

describe("i quattro «cloni» che non aggiungono niente danno gli stessi numeri degli altri", () => {
  it("lo stesso input dà lo stesso risultato in tutti gli otto moduli, campo per campo", () => {
    let seme = 7;
    const caso = () => { seme = (seme * 1664525 + 1013904223) % 4294967296; return seme / 4294967296; };
    for (let k = 0; k < 60; k++) {
      const rs = Array.from({ length: 1 + Math.floor(caso() * 8) }, (_, i) => ({
        capitolo_nome: i % 2 ? "X" : "Y", quantita: Math.round(caso() * 4000) / 100, prezzo_unitario: Math.round(caso() * 300000) / 100,
        sconto_pct: Math.round(caso() * 20), costo_materiali: Math.round(caso() * 5000) / 100, costo_manodopera: Math.round(caso() * 3000) / 100,
      }));
      const opts = { sconto_pct: Math.round(caso() * 15), iva_pct: [0, 4, 10, 22][Math.floor(caso() * 4)], prezzo_manuale: caso() < 0.3 ? 12345.67 : null };
      const risultati = MODULI.map(([, calc]) => JSON.stringify(calc.calcTotaliComputo(rs, opts)));
      for (const r of risultati) expect(r).toBe(risultati[0]);
    }
  });
});

describe("le funzioni di superficie dei moduli che le hanno", () => {
  it("bagni: pavimento e rivestimento arrotondati a 0,1 mq", () => {
    // Pavimento 8,04 → 8,0; perimetro 12 × altezza 2,4 = 28,8.
    expect(bagni.calcRivestimenti(8.04, 12, 2.4)).toEqual({ pavimento_mq: 8, rivestimento_mq: 28.8 });
    // 10,25 → 10,3 (si arrotonda per eccesso a metà); perimetro 9,3 × 2,15 = 19,995 → 20,0.
    expect(bagni.calcRivestimenti(10.26, 9.3, 2.15)).toEqual({ pavimento_mq: 10.3, rivestimento_mq: 20 });
    expect(bagni.calcRivestimenti(-3, Number.NaN, 2.4)).toEqual({ pavimento_mq: 0, rivestimento_mq: 0 });
  });

  it("tetti: la falda inclinata è più grande della pianta; la lattoneria segue il perimetro", () => {
    // 100 mq in pianta con pendenza 30% → 100 × √(1 + 0,09) = 104,403…
    expect(tetti.calcSuperficieFalda(100, 30)).toBeCloseTo(104.4030650891, 9);
    expect(tetti.calcSuperficieFalda(100, 0)).toBe(100);
    expect(tetti.calcSuperficieFalda(-5, 30)).toBe(0);
    // Pluviali: uno ogni 12 ml di gronda, almeno due; perimetro 0 → niente.
    expect(tetti.stimaLattoneria(0)).toEqual({ gronde_ml: 0, pluviali_n: 0 });
    expect(tetti.stimaLattoneria(10)).toEqual({ gronde_ml: 10, pluviali_n: 2 });
    expect(tetti.stimaLattoneria(24)).toEqual({ gronde_ml: 24, pluviali_n: 2 });
    expect(tetti.stimaLattoneria(24.5)).toEqual({ gronde_ml: 25, pluviali_n: 3 });
    expect(tetti.stimaLattoneria(61)).toEqual({ gronde_ml: 61, pluviali_n: 6 });
  });

  it("ristrutturazione: superfici stimate da mq, altezza e numero di vani", () => {
    // 60 mq, 2,7 m, 3 vani → ogni vano 20 mq, perimetro 4 × √20 = 17,89 m → pareti 17,89 × 2,7 × 3 = 144,9 → 145.
    expect(ristrutturazione.stimaSuperficiVani(60, 2.7, 3)).toEqual({ pavimenti: 60, soffitti: 60, pareti: 145, tinteggiature: 205 });
    // Zero vani o vani non validi valgono 1: un solo vano da 40 mq, perimetro 4 × √40 = 25,3 → × 3 = 75,9 → 76.
    expect(ristrutturazione.stimaSuperficiVani(40, 3, 0)).toEqual({ pavimenti: 40, soffitti: 40, pareti: 76, tinteggiature: 116 });
    expect(ristrutturazione.stimaSuperficiVani(40, 3, Number.NaN).pareti).toBe(76);
    expect(ristrutturazione.stimaSuperficiVani(0, 3, 2)).toEqual({ pavimenti: 0, soffitti: 0, pareti: 0, tinteggiature: 0 });
  });
});
