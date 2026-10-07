/**
 * Controllo di correttezza dei conti del preventivatore Serramenti (06/10/2026).
 *
 * Gli attesi sono calcolati A MANO (la spiegazione è nel commento di ogni caso) o con una piccola
 * implementazione ingenua e indipendente, in centesimi interi: mai richiamando la funzione provata.
 * Si controllano il totale con sconti e IVA (anche mista), la detrazione col massimale, il
 * finanziamento e la tabella della finanziaria, il risparmio, il recupero in dieci anni e i numeri
 * sporchi (vuoti, sconto oltre il 100%, testo): mai NaN, Infinity o «-0» nei totali.
 */
import { describe, expect, it } from "vitest";
import { calcolaTotale, calcolaIvaMista, IVA_MISTA_SENTINEL } from "@/lib/serramenti/calcoli";
import {
  ALIQUOTE_DETRAZIONE_SERRAMENTI, aliquotaDetrazioneSerramenti, calcolaCashflow, calcolaEcobonus,
  calcolaPianoFinanziamento, calcolaRata,
} from "@/lib/serramenti/ecobonus";
import { bollettaMediaRiscaldamento, calcolaRisparmio } from "@/lib/serramenti/risparmio";
import { calcDetraibile } from "@/lib/preventivi/incentivi";
import { findMigliorRiga, getDurateUniche, type RigaFinanziamento } from "@/hooks/useTabelleFinanziamento";
import type { SrAccessorioRow, SrSerramentoRow, SrServizioRow } from "@/types/serramenti";

const finestra = (extra: Partial<SrSerramentoRow>) =>
  ({ quantita: 1, prezzo_unitario: null, prezzo_totale: null, larghezza_mm: 1000, altezza_mm: 1000, metri_quadri: null, ...extra }) as SrSerramentoRow;
const accessorio = (extra: Partial<SrAccessorioRow>) =>
  ({ quantita: 1, prezzo_unitario: null, prezzo_totale: null, ...extra }) as SrAccessorioRow;
const servizio = (extra: Partial<SrServizioRow>) =>
  ({ quantita: 1, prezzo_unitario_vendita: null, prezzo_totale_vendita: null, ...extra }) as SrServizioRow;

/** Centesimi interi: così si confronta senza i decimali dei float. */
const cent = (euro: number) => Math.round(euro * 100);

describe("calcolaTotale — scenari calcolati a mano", () => {
  // Due finestre (2 × 1.250,00 e 1 × 1.340,50), un complemento da 300,00 e un servizio da 150,00.
  const finestre = [finestra({ quantita: 2, prezzo_totale: 2500, metri_quadri: 3.36 }), finestra({ prezzo_totale: 1340.5, metri_quadri: 1 })];
  const complementi = [accessorio({ prezzo_totale: 300 })];
  const servizi = [servizio({ prezzo_totale_vendita: 150 })];
  // 2.500,00 + 1.340,50 = 3.840,50 di finestre; + 300 + 150 = 4.290,50 di voci.

  it("1. semplice, IVA 10%: 4.290,50 + 429,05 = 4.719,55", () => {
    const t = calcolaTotale(finestre, complementi, { iva_percentuale: 10 }, servizi);
    expect(cent(t.imponibile_serramenti)).toBe(384050);
    expect(cent(t.imponibile_accessori)).toBe(30000);
    expect(cent(t.imponibile_servizi)).toBe(15000);
    expect(cent(t.imponibile_lordo)).toBe(429050);
    expect(t.sconto).toBe(0);
    expect(cent(t.iva_importo)).toBe(42905);
    expect(cent(t.totale_iva_inclusa)).toBe(471955);
    expect(t.num_serramenti).toBe(3);
    expect(t.metri_quadri).toBeCloseTo(4.36, 9);
  });

  it("2. sconto del 10% e IVA 22%: netto 3.861,45, IVA 849,519, totale 4.710,969", () => {
    // sconto = 4.290,50 × 10% = 429,05; netto = 3.861,45; IVA = 3.861,45 × 22% = 849,519.
    const t = calcolaTotale(finestre, complementi, { iva_percentuale: 22, sconto_percentuale: 10 }, servizi);
    expect(cent(t.sconto)).toBe(42905);
    expect(cent(t.imponibile_netto)).toBe(386145);
    expect(t.iva_importo).toBeCloseTo(849.519, 6);
    expect(t.totale_iva_inclusa).toBeCloseTo(4710.969, 6);
  });

  it("3. sconto fisso e poi percentuale: (4.290,50 − 150) × 95% = 3.933,475; IVA 4%", () => {
    // Prima il fisso, poi il %: dopo il fisso 4.140,50; il 5% ne toglie 207,025; sconto totale 357,025.
    const t = calcolaTotale(finestre, complementi, { iva_percentuale: 4, sconto_importo: 150, sconto_percentuale: 5 }, servizi);
    expect(t.imponibile_netto).toBeCloseTo(3933.475, 6);
    expect(t.sconto).toBeCloseTo(357.025, 6);
    expect(t.iva_importo).toBeCloseTo(157.339, 6); // 3.933,475 × 4%
    expect(t.totale_iva_inclusa).toBeCloseTo(4090.814, 6);
  });

  it("4. IVA 0%: il totale è l'imponibile", () => {
    const t = calcolaTotale(finestre, complementi, { iva_percentuale: 0, sconto_percentuale: 10 }, servizi);
    expect(t.iva_importo).toBe(0);
    expect(t.totale_iva_inclusa).toBe(t.imponibile_netto);
    expect(t.iva_pct_applicata).toBe(0);
  });

  it("5. senza IVA indicata si usa il 10% (ristrutturazione)", () => {
    const t = calcolaTotale(finestre, complementi, {}, servizi);
    expect(t.iva_pct_applicata).toBe(10);
    expect(cent(t.totale_iva_inclusa)).toBe(471955);
  });

  it("6. quantità decimali: 3 × 33,33 e 0,5 × 1.234,56 (senza totale di riga)", () => {
    // 3 × 33,33 = 99,99 e 0,5 × 1.234,56 = 617,28: voci 717,27; IVA 10% = 71,727; totale 788,997.
    const t = calcolaTotale(
      [], [accessorio({ prezzo_unitario: 33.33, quantita: 3 }), accessorio({ prezzo_unitario: 1234.56, quantita: 0.5 })], { iva_percentuale: 10 },
    );
    expect(cent(t.imponibile_lordo)).toBe(71727);
    expect(t.totale_iva_inclusa).toBeCloseTo(788.997, 6);
  });

  it("7. la voce a 0 € (omaggio) non pesa, il computo vuoto fa 0 senza NaN", () => {
    const conOmaggio = calcolaTotale([finestra({ prezzo_totale: 1000 }), finestra({ prezzo_totale: 0 })], [], { iva_percentuale: 22 });
    expect(conOmaggio.imponibile_lordo).toBe(1000);
    expect(conOmaggio.num_serramenti).toBe(2);
    const vuoto = calcolaTotale([], [], { iva_percentuale: 22, sconto_percentuale: 10 });
    expect(vuoto).toMatchObject({ imponibile_lordo: 0, imponibile_netto: 0, iva_importo: 0, totale_iva_inclusa: 0, sconto: 0 });
    const vuotoMista = calcolaTotale([], [], { iva_percentuale: IVA_MISTA_SENTINEL });
    expect(vuotoMista.totale_iva_inclusa).toBe(0);
    expect(vuotoMista.iva_pct_applicata).toBe(10);
  });

  it("8. la riga con il solo prezzo unitario: unitario × pezzi", () => {
    const t = calcolaTotale([finestra({ prezzo_unitario: 480, quantita: 6 })], [], { iva_percentuale: 10 });
    expect(t.imponibile_serramenti).toBe(2880);
  });

  it("9. il prezzo scritto a mano prende il posto delle voci e lo sconto lavora sopra", () => {
    // Voci 4.290,50 ma prezzo scritto 5.000: lordo 5.000; −20% = 4.000 di netto; IVA 22% = 880; totale 4.880.
    const t = calcolaTotale(finestre, complementi, { iva_percentuale: 22, sconto_percentuale: 20, prezzo_manuale: 5000 }, servizi);
    expect(t.prezzo_manuale).toBe(true);
    expect(cent(t.somma_voci)).toBe(429050);
    expect(t.imponibile_lordo).toBe(5000);
    expect(cent(t.imponibile_netto)).toBe(400000);
    expect(cent(t.totale_iva_inclusa)).toBe(488000);
  });

  it("10. uno sconto fisso più grande del prezzo porta a zero, mai sotto", () => {
    const t = calcolaTotale([finestre[0]], [], { iva_percentuale: 10, sconto_importo: 9999 });
    expect(t.imponibile_netto).toBe(0);
    expect(t.totale_iva_inclusa).toBe(0);
    expect(t.sconto).toBe(2500);
  });

  it("11. sconto del 100%: totale 0, anche con l'IVA mista", () => {
    const voci = [finestra({ prezzo_totale: 5000 })];
    expect(calcolaTotale(voci, [], { iva_percentuale: 22, sconto_percentuale: 100 }).totale_iva_inclusa).toBe(0);
    const mista = calcolaTotale(voci, [accessorio({ prezzo_totale: 1000 })], { iva_percentuale: IVA_MISTA_SENTINEL, sconto_percentuale: 100 });
    expect(mista.totale_iva_inclusa).toBe(0);
    expect(mista.mista_breakdown?.iva_10).toBe(0);
  });
});

describe("IVA mista (beni significativi, DM 29.12.99)", () => {
  it("l'esempio del codice: serramenti 1.690 ≤ altre prestazioni 2.820 → tutto al 10%", () => {
    const t = calcolaTotale([finestra({ prezzo_totale: 1690 })], [accessorio({ prezzo_totale: 1270 })], { iva_percentuale: IVA_MISTA_SENTINEL }, [servizio({ prezzo_totale_vendita: 1550 })]);
    expect(cent(t.mista_breakdown!.imponibile_10)).toBe(451000);
    expect(t.mista_breakdown!.imponibile_22).toBe(0);
    expect(cent(t.iva_importo)).toBe(45100);
    expect(cent(t.totale_iva_inclusa)).toBe(496100);
  });

  // Serramenti 5.000, complementi 1.200, servizi 800: le altre prestazioni valgono 2.000.
  const voci = { s: [finestra({ prezzo_totale: 5000 })], a: [accessorio({ prezzo_totale: 1200 })], m: [servizio({ prezzo_totale_vendita: 800 })] };

  it("serramenti oltre le altre prestazioni: 2.000 al 10% (più le altre 2.000), 3.000 al 22%", () => {
    // imponibile 10% = 2.000 + 2.000 = 4.000 → IVA 400; imponibile 22% = 3.000 → IVA 660; totale 7.000 + 1.060 = 8.060.
    const t = calcolaTotale(voci.s, voci.a, { iva_percentuale: IVA_MISTA_SENTINEL }, voci.m);
    const b = t.mista_breakdown!;
    expect([cent(b.imponibile_10), cent(b.imponibile_22)]).toEqual([400000, 300000]);
    expect([cent(b.iva_10), cent(b.iva_22)]).toEqual([40000, 66000]);
    expect(cent(t.iva_importo)).toBe(106000);
    expect(cent(t.totale_iva_inclusa)).toBe(806000);
    expect(t.iva_pct_applicata).toBeCloseTo(15.14, 2); // 1.060 / 7.000
  });

  it("la somma delle quote IVA è l'IVA totale e le due basi fanno l'imponibile, con lo sconto e col prezzo scritto a mano", () => {
    const casi = [
      { sconto_percentuale: 10 },
      { sconto_importo: 333.33, sconto_percentuale: 7.5 },
      { prezzo_manuale: 9020 },
      { prezzo_manuale: 6500, sconto_percentuale: 12.5 },
    ];
    for (const caso of casi) {
      const t = calcolaTotale(voci.s, voci.a, { iva_percentuale: IVA_MISTA_SENTINEL, ...caso }, voci.m);
      const b = t.mista_breakdown!;
      expect(b.iva_10 + b.iva_22, JSON.stringify(caso)).toBeCloseTo(t.iva_importo, 9);
      expect(b.imponibile_10 + b.imponibile_22, JSON.stringify(caso)).toBeCloseTo(t.imponibile_netto, 6);
      expect(t.totale_iva_inclusa).toBeCloseTo(t.imponibile_netto + t.iva_importo, 9);
    }
  });

  it("lo sconto scala tutte le categorie nella stessa proporzione: l'aliquota effettiva non cambia", () => {
    // Sconto 10%: ogni categoria × 0,9 → IVA 954 su 6.300 di netto = 15,14% come prima; totale 7.254.
    const t = calcolaTotale(voci.s, voci.a, { iva_percentuale: IVA_MISTA_SENTINEL, sconto_percentuale: 10 }, voci.m);
    expect(cent(t.imponibile_netto)).toBe(630000);
    expect(cent(t.iva_importo)).toBe(95400);
    expect(cent(t.totale_iva_inclusa)).toBe(725400);
  });

  it("prezzo scritto a mano 9.000 su voci da 7.000: stessa aliquota effettiva (1.060 / 7.000)", () => {
    // IVA = 9.000 × 1.060 / 7.000 = 1.362,857…; totale 10.362,857…
    const t = calcolaTotale(voci.s, voci.a, { iva_percentuale: IVA_MISTA_SENTINEL, prezzo_manuale: 9000 }, voci.m);
    expect(t.iva_importo).toBeCloseTo(1362.857142857, 6);
    expect(t.totale_iva_inclusa).toBeCloseTo(10362.857142857, 6);
  });

  it("solo serramenti (la posa è nel loro prezzo): non ci sono altre prestazioni e tutto va al 22%", () => {
    const t = calcolaTotale([finestra({ prezzo_totale: 10000 })], [], { iva_percentuale: IVA_MISTA_SENTINEL });
    expect(t.iva_importo).toBe(2200);
  });

  it("solo complementi e servizi: tutto al 10%", () => {
    const t = calcolaTotale([], [accessorio({ prezzo_totale: 1000 })], { iva_percentuale: IVA_MISTA_SENTINEL }, [servizio({ prezzo_totale_vendita: 500 })]);
    expect(t.iva_importo).toBe(150);
  });

  it("prestazioni professionali: sempre al 22%, oltre il resto", () => {
    // Beni 1.690, altre 2.820, professionali 150: 4.510 al 10% (451) e 150 al 22% (33).
    const b = calcolaIvaMista(1690, 1270, 1550, 150);
    expect([b.imponibile_10, b.imponibile_22, b.iva_10, b.iva_22]).toEqual([4510, 150, 451, 33]);
  });

  it("voci negative non fanno sconti nascosti: valgono 0", () => {
    const b = calcolaIvaMista(-500, -100, -100, -50);
    expect([b.imponibile_10, b.imponibile_22, b.iva_10, b.iva_22]).toEqual([0, 0, 0, 0]);
  });
});

describe("calcolaTotale — numeri sporchi e invarianti", () => {
  it("vuoti, nulli e non numeri valgono 0: mai NaN, Infinity o -0", () => {
    const sporche = [
      finestra({ prezzo_totale: null, prezzo_unitario: null, quantita: null as unknown as number }),
      finestra({ prezzo_totale: undefined as unknown as number, prezzo_unitario: Number.NaN, quantita: 3 }),
      finestra({ prezzo_totale: "12,5" as unknown as number }),
      finestra({ prezzo_totale: Number.POSITIVE_INFINITY }),
      finestra({ prezzo_totale: 700 }),
    ];
    const t = calcolaTotale(sporche, [accessorio({ prezzo_totale: "abc" as unknown as number })], { iva_percentuale: 22 }, [servizio({ prezzo_totale_vendita: Number.NaN })]);
    for (const [campo, valore] of Object.entries(t)) {
      if (typeof valore === "number") {
        expect(Number.isFinite(valore), campo).toBe(true);
        expect(Object.is(valore, -0), campo).toBe(false);
      }
    }
    expect(t.imponibile_lordo).toBe(700);
    expect(cent(t.totale_iva_inclusa)).toBe(85400);
  });

  it("sconto oltre il 100% o negativo, sconto fisso negativo, IVA vuota: il totale non va mai sotto zero né sopra le voci", () => {
    const voci = [finestra({ prezzo_totale: 1000 })];
    const oltre = calcolaTotale(voci, [], { iva_percentuale: 10, sconto_percentuale: 150 });
    expect(oltre.imponibile_netto).toBe(0);
    expect(oltre.totale_iva_inclusa).toBe(0);
    expect(oltre.sconto).toBe(1000);
    const negativo = calcolaTotale(voci, [], { iva_percentuale: 10, sconto_percentuale: -20, sconto_importo: -50 });
    expect(negativo.imponibile_netto).toBe(1000);
    expect(negativo.sconto).toBe(0);
    expect(calcolaTotale(voci, [], { iva_percentuale: Number.NaN }).iva_importo).toBe(100); // IVA illeggibile: il 10% di serie
  });

  it("invarianti su 400 preventivi a caso: totale = imponibile + IVA, imponibile = lordo − sconto, tutto finito e non negativo", () => {
    let seme = 20261006;
    const caso = () => { seme = (seme * 1103515245 + 12345) & 0x7fffffff; return seme / 0x7fffffff; };
    for (let i = 0; i < 400; i++) {
      const righe = Array.from({ length: Math.floor(caso() * 5) }, () => finestra({ prezzo_totale: Math.round(caso() * 400000) / 100 }));
      const comp = Array.from({ length: Math.floor(caso() * 3) }, () => accessorio({ prezzo_totale: Math.round(caso() * 80000) / 100 }));
      const serv = Array.from({ length: Math.floor(caso() * 2) }, () => servizio({ prezzo_totale_vendita: Math.round(caso() * 50000) / 100 }));
      const iva = [0, 4, 10, 22, IVA_MISTA_SENTINEL][Math.floor(caso() * 5)];
      const t = calcolaTotale(righe, comp, {
        iva_percentuale: iva,
        sconto_percentuale: caso() < 0.5 ? Math.round(caso() * 3000) / 100 : 0,
        sconto_importo: caso() < 0.3 ? Math.round(caso() * 50000) / 100 : 0,
        prezzo_manuale: caso() < 0.2 ? Math.round(caso() * 900000) / 100 : null,
      }, serv);
      const dove = JSON.stringify({ i, iva, lordo: t.imponibile_lordo });
      expect(t.totale_iva_inclusa, dove).toBeCloseTo(t.imponibile_netto + t.iva_importo, 8);
      expect(t.imponibile_netto, dove).toBeCloseTo(t.imponibile_lordo - t.sconto, 8);
      for (const v of [t.imponibile_lordo, t.imponibile_netto, t.iva_importo, t.totale_iva_inclusa, t.sconto]) {
        expect(Number.isFinite(v), dove).toBe(true);
        expect(v, dove).toBeGreaterThanOrEqual(0);
      }
      if (t.mista_breakdown && t.imponibile_netto > 0 && t.imponibile_lordo > 0) {
        const b = t.mista_breakdown;
        expect(b.iva_10 + b.iva_22, dove).toBeCloseTo(t.iva_importo, 8);
        expect(b.imponibile_10 + b.imponibile_22, dove).toBeCloseTo(t.imponibile_netto, 6);
      }
    }
  });
});

describe("detrazione fiscale: base, massimale, aliquota", () => {
  it("50% prima casa su 12.000 € IVA inclusa: 6.000 € in 10 quote da 600", () => {
    expect(calcolaEcobonus({ imponibile_eur: 12000, aliquota: 50 })).toMatchObject({ base_calcolo: 12000, detrazione_totale: 6000, rata_annuale: 600, anni_recupero: 10 });
  });

  it("36% altre abitazioni su 10.000 €: 3.600 in 10 quote da 360", () => {
    expect(calcolaEcobonus({ imponibile_eur: 10000, aliquota: 36 })).toMatchObject({ detrazione_totale: 3600, rata_annuale: 360 });
  });

  it("il massimale di 96.000 € taglia la base: su 120.000 € il 50% è 48.000, non 60.000", () => {
    expect(calcolaEcobonus({ imponibile_eur: 120000, aliquota: 50 })).toMatchObject({ base_calcolo: 96000, detrazione_totale: 48000, rata_annuale: 4800 });
    expect(calcolaEcobonus({ imponibile_eur: 96000, aliquota: 36 }).detrazione_totale).toBeCloseTo(34560, 6);
    expect(calcolaEcobonus({ imponibile_eur: 96000.01, aliquota: 50 }).base_calcolo).toBe(96000);
  });

  it("un massimale diverso, passato a parte, vince su quello di serie", () => {
    expect(calcolaEcobonus({ imponibile_eur: 30000, aliquota: 50, spesa_massima_eur: 20000 })).toMatchObject({ base_calcolo: 20000, detrazione_totale: 10000 });
  });

  it("la base è il totale IVA inclusa dopo lo sconto: 10.000 − 10% con IVA 22% → 10.980 → 5.490", () => {
    // netto 9.000; IVA 1.980; totale 10.980; 50% = 5.490; rata 549.
    const t = calcolaTotale([finestra({ prezzo_totale: 10000 })], [], { iva_percentuale: 22, sconto_percentuale: 10 });
    const e = calcolaEcobonus({ imponibile_eur: cent(t.totale_iva_inclusa) / 100, aliquota: 50 });
    expect(cent(e.detrazione_totale)).toBe(549000);
    expect(cent(e.rata_annuale)).toBe(54900);
  });

  it("la stessa spesa con IVA al 10% o al 22% dà una detrazione diversa, perché l'IVA è spesa", () => {
    const con = (iva: number) => calcolaEcobonus({ imponibile_eur: calcolaTotale([finestra({ prezzo_totale: 10000 })], [], { iva_percentuale: iva }).totale_iva_inclusa, aliquota: 50 }).detrazione_totale;
    expect(con(10)).toBe(5500);
    expect(con(22)).toBe(6100);
  });

  it("capienza: l'IRPEF del 23% sul reddito deve coprire la quota annua", () => {
    expect(calcolaEcobonus({ imponibile_eur: 12000, aliquota: 50, reddito_irpef_anno: 20000 }).capienza_ok).toBe(true); // 4.600 ≥ 600
    expect(calcolaEcobonus({ imponibile_eur: 96000, aliquota: 50, reddito_irpef_anno: 20000 }).capienza_ok).toBe(false); // 4.600 < 4.800
    expect(calcolaEcobonus({ imponibile_eur: 12000, aliquota: 50 }).capienza_ok).toBeNull();
  });

  it("le aliquote proponibili sono 50 e 36; un 65% di prima del 2025 si mostra come 50%", () => {
    expect(ALIQUOTE_DETRAZIONE_SERRAMENTI.map((i) => i.pct)).toEqual([50, 36]);
    expect([65, 36, 50, null, undefined, 0, 12].map((v) => aliquotaDetrazioneSerramenti(v))).toEqual([50, 36, 50, 50, 50, 50, 50]);
  });

  it("il conteggio condiviso (altri moduli) non va mai sotto zero e rispetta il massimale", () => {
    expect(calcDetraibile(120000, 50, 96000)).toBe(48000);
    expect(calcDetraibile(-500, 50, 96000)).toBe(0);
    expect(calcDetraibile(10000, 150, null)).toBe(10000); // aliquota oltre il 100%: tetto al 100%
    expect(calcDetraibile(Number.NaN, 50, null)).toBe(0);
  });
});

/** Rata costante calcolata a tentativi (bisezione sul debito residuo): nessuna formula chiusa. */
function rataPerTentativi(importo: number, mesi: number, tanPct: number): number {
  const i = tanPct / 100 / 12;
  const residuo = (rata: number) => {
    let debito = importo;
    for (let m = 0; m < mesi; m++) debito = debito * (1 + i) - rata;
    return debito;
  };
  let basso = 0;
  let alto = importo;
  for (let n = 0; n < 200; n++) {
    const medio = (basso + alto) / 2;
    if (residuo(medio) > 0) basso = medio; else alto = medio;
  }
  return Math.round(((basso + alto) / 2) * 100) / 100;
}

describe("finanziamento: rata e piano", () => {
  it("TAN 0: importo diviso per le rate", () => {
    expect(calcolaRata({ importo_finanziato: 7200, durata_mesi: 60, tasso_annuo_pct: 0 })).toBe(120);
    expect(calcolaRata({ importo_finanziato: 1000, durata_mesi: 3, tasso_annuo_pct: 0 })).toBe(333.33);
  });

  it("TAN > 0: la rata torna con un ammortamento calcolato a tentativi, per molte durate e tassi", () => {
    for (const [importo, mesi, tan] of [[10000, 120, 5.5], [7200, 120, 5.5], [6480, 60, 4.75], [25000, 84, 9.9], [3000, 12, 0.5], [18000, 180, 7.2]] as const) {
      expect(calcolaRata({ importo_finanziato: importo, durata_mesi: mesi, tasso_annuo_pct: tan }), `${importo}/${mesi}/${tan}`).toBe(rataPerTentativi(importo, mesi, tan));
    }
    expect(calcolaRata({ importo_finanziato: 10000, durata_mesi: 120, tasso_annuo_pct: 5.5 })).toBe(108.53);
  });

  it("senza importo, senza durata o con numeri non validi la rata è 0, mai NaN", () => {
    for (const rata of [
      calcolaRata({ importo_finanziato: 0, durata_mesi: 60, tasso_annuo_pct: 5 }),
      calcolaRata({ importo_finanziato: 5000, durata_mesi: 0, tasso_annuo_pct: 5 }),
      calcolaRata({ importo_finanziato: Number.NaN, durata_mesi: 60, tasso_annuo_pct: 5 }),
      calcolaRata({ importo_finanziato: -100, durata_mesi: 60, tasso_annuo_pct: 5 }),
      calcolaRata({ importo_finanziato: 5000, durata_mesi: Number.NaN, tasso_annuo_pct: 5 }),
    ]) expect(rata).toBe(0);
    // Un tasso negativo vale 0: nessuno sconto di interessi inventato.
    expect(calcolaRata({ importo_finanziato: 6000, durata_mesi: 60, tasso_annuo_pct: -3 })).toBe(100);
  });

  it("il piano: anticipo 40% su 12.000 → 4.800 + 7.200 da finanziare, rata e totale pagato", () => {
    const p = calcolaPianoFinanziamento({ importo_totale: 12000, anticipo_pct: 40, piani: [{ nome: "Standard", durata_mesi: 60, tasso_annuo_pct: 0 }] });
    expect(p).toMatchObject({ anticipo: 4800, finanziato: 7200 });
    expect(p.piani[0]).toMatchObject({ rata_mese: 120, totale_pagato: 7200, mesi: 60 });
  });

  it("anticipo 0%: si finanzia tutto; anticipo 100%: niente da finanziare e rata 0", () => {
    const zero = calcolaPianoFinanziamento({ importo_totale: 12000, anticipo_pct: 0, piani: [{ nome: "A", durata_mesi: 60, tasso_annuo_pct: 0 }] });
    expect(zero).toMatchObject({ anticipo: 0, finanziato: 12000 });
    expect(zero.piani[0].rata_mese).toBe(200);
    const cento = calcolaPianoFinanziamento({ importo_totale: 12000, anticipo_pct: 100, piani: [{ nome: "A", durata_mesi: 60, tasso_annuo_pct: 5.5 }] });
    expect(cento).toMatchObject({ anticipo: 12000, finanziato: 0 });
    expect(cento.piani[0]).toMatchObject({ rata_mese: 0, totale_pagato: 0 });
  });

  it("due piani sullo stesso importo: ognuno con la sua rata; il totale pagato è rata × mesi", () => {
    const p = calcolaPianoFinanziamento({ importo_totale: 10000, anticipo_pct: 0, piani: [{ nome: "Estesa", durata_mesi: 120, tasso_annuo_pct: 5.5 }, { nome: "Standard", durata_mesi: 60, tasso_annuo_pct: 0 }] });
    expect(p.piani.map((x) => x.rata_mese)).toEqual([108.53, 166.67]);
    expect(p.piani[0].totale_pagato).toBe(Math.round(108.53 * 120 * 100) / 100);
    expect(p.piani[1].totale_pagato).toBe(Math.round(166.67 * 60 * 100) / 100);
  });
});

describe("tabella della finanziaria: findMigliorRiga", () => {
  const riga = (importo: number, mesi: number, rata: number): RigaFinanziamento => ({
    id: `r-${mesi}-${importo}`, tabella_id: "t", subtariffa: null, importo_erogato: importo, spese_istruttoria: null, importo_totale_credito: null,
    numero_rate: mesi, durata_mesi: mesi, prima_rata_giorni: null, importo_rata: rata, spese_incasso_rata: null, interessi_cliente: null,
    importo_totale_dovuto: null, tan: 5, taeg: 5.5, icc: null,
  });
  // Tre fasce (10.000, 20.000, 30.000) a 60 e a 84 mesi, ordinate come le legge la query (importo, poi durata).
  const tabella = [riga(10000, 60, 200), riga(10000, 84, 150), riga(20000, 60, 400), riga(20000, 84, 300), riga(30000, 60, 600), riga(30000, 84, 450)];

  it("importo esatto di una fascia: quella fascia", () => {
    expect(findMigliorRiga(tabella, 20000, 60)?.importo_rata).toBe(400);
  });

  it("importo tra due fasce: la fascia sopra (la prima che lo copre)", () => {
    expect(findMigliorRiga(tabella, 10000.01, 60)?.importo_rata).toBe(400);
    expect(findMigliorRiga(tabella, 15000, 84)?.importo_rata).toBe(300);
  });

  it("importo sotto la fascia più bassa: la fascia più bassa", () => {
    expect(findMigliorRiga(tabella, 2000, 60)?.importo_rata).toBe(200);
    expect(findMigliorRiga(tabella, 0, 60)?.importo_rata).toBe(200);
  });

  it("una durata che non c'è: la durata subito più lunga", () => {
    expect(findMigliorRiga(tabella, 20000, 70)?.importo_rata).toBe(300);
    expect(findMigliorRiga(tabella, 20000, 12)?.importo_rata).toBe(400); // la più corta della tabella: 60
  });

  it("senza righe: nessuna riga; le durate della tabella sono uniche e in ordine", () => {
    expect(findMigliorRiga([], 5000, 60)).toBeNull();
    expect(getDurateUniche(tabella)).toEqual([60, 84]);
  });
});

describe("risparmio energetico", () => {
  it("formula: 10 m², Uw 2,8 → 1,1, zona E (2.400 GG), caldaia 0,85, 0,10 €/kWh", () => {
    // fattore = 10 × 2.400 × 24 / 1.000 = 576 kWh per W/m²K; perso prima 2,8 × 576 / 0,85 = 1.897,41;
    // dopo 1,1 × 576 / 0,85 = 745,41; risparmio 1.152 kWh = 115,20 € e 230,4 kg di CO₂.
    const r = calcolaRisparmio({ zona_climatica: "E", m2_serramenti: 10, uw_attuale: 2.8, uw_nuovo: 1.1 });
    expect(r.gradi_giorno).toBe(2400);
    expect(r.kwh_persi_attuali).toBeCloseTo(1897.4118, 3);
    expect(r.kwh_persi_nuovi).toBeCloseTo(745.4118, 3);
    expect(r.risparmio_kwh_anno).toBeCloseTo(1152, 6);
    expect(r.risparmio_eur_anno).toBeCloseTo(115.2, 6);
    expect(r.co2_risparmiata_kg_anno).toBeCloseTo(230.4, 6);
  });

  it("la percentuale sulla bolletta c'è solo se la bolletta è nota", () => {
    expect(calcolaRisparmio({ zona_climatica: "E", m2_serramenti: 10, uw_attuale: 2.8, uw_nuovo: 1.1, bolletta_attuale_anno: 1152 }).risparmio_pct).toBeCloseTo(10, 6);
    expect(calcolaRisparmio({ zona_climatica: "E", m2_serramenti: 10, uw_attuale: 2.8, uw_nuovo: 1.1 }).risparmio_pct).toBeNull();
  });

  it("nessun risparmio se il nuovo serramento non è migliore, se non ci sono m² o se i numeri non sono validi", () => {
    for (const r of [
      calcolaRisparmio({ zona_climatica: "E", m2_serramenti: 10, uw_attuale: 1.4, uw_nuovo: 1.4 }),
      calcolaRisparmio({ zona_climatica: "E", m2_serramenti: 10, uw_attuale: 1.0, uw_nuovo: 1.4 }),
      calcolaRisparmio({ zona_climatica: "E", m2_serramenti: 0, uw_attuale: 2.8, uw_nuovo: 1.1 }),
      calcolaRisparmio({ zona_climatica: "E", m2_serramenti: Number.NaN, uw_attuale: 2.8, uw_nuovo: 1.1 }),
    ]) expect(r.risparmio_eur_anno).toBe(0);
  });

  it("l'efficienza della caldaia è tenuta fra 0,5 e 1: nessuna divisione per zero", () => {
    const zero = calcolaRisparmio({ zona_climatica: "E", m2_serramenti: 10, uw_attuale: 2.8, uw_nuovo: 1.1, efficienza_caldaia: 0 });
    const meta = calcolaRisparmio({ zona_climatica: "E", m2_serramenti: 10, uw_attuale: 2.8, uw_nuovo: 1.1, efficienza_caldaia: 0.5 });
    expect(zero.risparmio_eur_anno).toBeCloseTo(meta.risparmio_eur_anno, 9);
    expect(Number.isFinite(zero.risparmio_eur_anno)).toBe(true);
  });

  it("bolletta media: €/m² della zona × m² della casa", () => {
    expect(bollettaMediaRiscaldamento("E", 100)).toBe(1600);
    expect(bollettaMediaRiscaldamento("A")).toBe(400);
  });

});

describe("recupero in dieci anni", () => {
  it("senza aumento dell'energia: 600 di risparmio + 600 di detrazione all'anno ripagano 12.000 in 10 anni", () => {
    const c = calcolaCashflow({ costo_iniziale: 12000, risparmio_eur_anno: 600, detrazione_eur_anno: 600, inflazione_energia_pct: 0 });
    expect(c.righe).toHaveLength(10);
    expect(c.righe[0]).toMatchObject({ anno: 1, flusso_anno: 1200, cumulato: 1200, netto: -10800 });
    expect(c.righe[9]).toMatchObject({ anno: 10, cumulato: 12000, netto: 0 });
    expect(c.payback_anni).toBe(10);
    expect(c.totale_recuperato_10y).toBe(12000);
    expect(c.pct_recuperato_10y).toBe(100);
    expect(c.costo_netto_10y).toBe(0);
  });

  it("payback frazionario: 6.000 con 1.000 all'anno → 6 anni; con 1.500 → 4 anni", () => {
    expect(calcolaCashflow({ costo_iniziale: 6000, risparmio_eur_anno: 500, detrazione_eur_anno: 500, inflazione_energia_pct: 0 }).payback_anni).toBe(6);
    expect(calcolaCashflow({ costo_iniziale: 6000, risparmio_eur_anno: 750, detrazione_eur_anno: 750, inflazione_energia_pct: 0 }).payback_anni).toBe(4);
    // 7.000 con 2.000 all'anno: anno 4 chiude a +1.000 → 4 − 1.000/2.000 = 3,5.
    expect(calcolaCashflow({ costo_iniziale: 7000, risparmio_eur_anno: 1000, detrazione_eur_anno: 1000, inflazione_energia_pct: 0 }).payback_anni).toBe(3.5);
  });

  it("se in dieci anni non si ripaga: nessun payback e il costo netto è quello che resta", () => {
    const c = calcolaCashflow({ costo_iniziale: 20000, risparmio_eur_anno: 300, detrazione_eur_anno: 500, inflazione_energia_pct: 0 });
    expect(c.payback_anni).toBeNull();
    expect(c.totale_recuperato_10y).toBe(8000);
    expect(c.costo_netto_10y).toBe(12000);
    expect(c.pct_recuperato_10y).toBe(40);
  });

  it("l'energia che rincara del 3% all'anno: il risparmio cresce, la detrazione resta quella", () => {
    // Anno 2: 1.000 × 1,03 = 1.030; la detrazione dura 10 anni e basta.
    const c = calcolaCashflow({ costo_iniziale: 5000, risparmio_eur_anno: 1000, detrazione_eur_anno: 0, inflazione_energia_pct: 3, anni_dettaglio: 12 });
    expect(c.righe[1].risparmio_bolletta).toBe(1030);
    expect(c.righe[11].detrazione).toBe(0);
    const con = calcolaCashflow({ costo_iniziale: 5000, risparmio_eur_anno: 100, detrazione_eur_anno: 400, anni_dettaglio: 12 });
    expect(con.righe[9].detrazione).toBe(400);
    expect(con.righe[10].detrazione).toBe(0);
  });

  it("numeri non validi: tutto a 0, mai NaN", () => {
    const c = calcolaCashflow({ costo_iniziale: Number.NaN, risparmio_eur_anno: Number.NaN, detrazione_eur_anno: -50 });
    expect(c.payback_anni).toBeNull();
    expect(Number.isFinite(c.totale_recuperato_10y)).toBe(true);
    expect(c.pct_recuperato_10y).toBe(0);
  });
});

