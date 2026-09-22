import { describe, expect, it } from "vitest";
import { calcolaTotale, IVA_MISTA_SENTINEL } from "@/lib/serramenti/calcoli";
import { totaliDelPreventivo } from "@/lib/serramenti/righePreventivo";
import { calcTotaliComputo as calcRistrutturazione } from "@/lib/ristrutturazione/calcoli";
import { calcTotaliComputo as calcBagni } from "@/lib/bagni/calcoli";
import { calcTotaliComputo as calcTetti } from "@/lib/tetti/calcoli";
import { calcTotaliComputo as calcClimatizzazione } from "@/lib/climatizzazione/calcoli";
import { calcTotaliComputo as calcElettrico } from "@/lib/elettrico/calcoli";
import { calcTotaliComputo as calcTermoidraulico } from "@/lib/termoidraulico/calcoli";
import { calcTotaliComputo as calcPavimenti } from "@/lib/pavimenti/calcoli";
import { calcTotaliComputo as calcPiscine } from "@/lib/piscine/calcoli";
import { prezzoDaTesto } from "@/lib/preventivi/prezzoAMano";
import { calcolaTotaliPreventivo } from "@/hooks/usePreventivoCosti";
import type { SrAccessorioRow, SrSerramentoRow, SrServizioRow } from "@/types/serramenti";

/**
 * Il prezzo del preventivo scritto a mano (21/09/2026).
 *
 * Infissi e Living usa il preventivatore serramenti per avere un bel documento
 * — finestre, foto, descrizioni — ma non carica i prezzi del listino: le voci
 * restano a 0 € e il prezzo lo decide alla fine. Il prezzo scritto è il prezzo
 * pieno IVA esclusa: prende il posto della somma delle voci, e sopra lavorano
 * sconto e IVA come sempre, così nell'offerta si vedono prezzo, sconto e totale.
 */
const serramento = (extra: Partial<SrSerramentoRow>) =>
  ({ quantita: 1, prezzo_unitario: 0, prezzo_totale: 0, larghezza_mm: 1000, altezza_mm: 1400, metri_quadri: null, ...extra }) as SrSerramentoRow;
const accessorio = (extra: Partial<SrAccessorioRow>) =>
  ({ quantita: 1, prezzo_unitario: 0, prezzo_totale: 0, ...extra }) as SrAccessorioRow;
const servizio = (extra: Partial<SrServizioRow>) =>
  ({ quantita: 1, prezzo_unitario_vendita: 0, prezzo_totale_vendita: 0, ...extra }) as SrServizioRow;

describe("Il prezzo del preventivo scritto a mano", () => {
  // Il caso di Infissi e Living: tre finestre e una zanzariera, tutte a 0 €.
  const finestreSenzaPrezzo = [serramento({ quantita: 2 }), serramento({})];
  const zanzariera = [accessorio({})];

  it("prende il posto della somma delle voci, e l'IVA si calcola sopra", () => {
    const t = calcolaTotale(finestreSenzaPrezzo, zanzariera, { iva_percentuale: 10, prezzo_manuale: 8000 });
    expect(t.somma_voci).toBe(0);
    expect(t.prezzo_manuale).toBe(true);
    expect(t.imponibile_lordo).toBe(8000);
    expect(t.imponibile_netto).toBe(8000);
    expect(t.iva_importo).toBeCloseTo(800, 6);
    expect(t.totale_iva_inclusa).toBeCloseTo(8800, 6);
  });

  it("lo sconto lavora sopra il prezzo scritto, come sulla somma delle voci", () => {
    // 8.000 − 10% = 7.200 imponibile; + 10% IVA = 7.920
    const pct = calcolaTotale(finestreSenzaPrezzo, zanzariera, { iva_percentuale: 10, sconto_percentuale: 10, prezzo_manuale: 8000 });
    expect(pct.imponibile_lordo).toBe(8000);
    expect(pct.sconto).toBeCloseTo(800, 6);
    expect(pct.imponibile_netto).toBeCloseTo(7200, 6);
    expect(pct.totale_iva_inclusa).toBeCloseTo(7920, 6);

    // Prima il fisso, poi il %: (8.000 − 500) × 0,9 = 6.750
    const entrambi = calcolaTotale(finestreSenzaPrezzo, zanzariera, {
      iva_percentuale: 22, sconto_importo: 500, sconto_percentuale: 10, prezzo_manuale: 8000,
    });
    expect(entrambi.imponibile_netto).toBeCloseTo(6750, 6);
    expect(entrambi.sconto).toBeCloseTo(1250, 6);
    expect(entrambi.totale_iva_inclusa).toBeCloseTo(8235, 6);
  });

  it("vale anche se alcune voci hanno un prezzo: comanda il prezzo scritto", () => {
    const conPrezzi = [serramento({ prezzo_totale: 1500 }), serramento({ prezzo_totale: 900 })];
    const t = calcolaTotale(conPrezzi, [], { iva_percentuale: 10, prezzo_manuale: 3000 });
    expect(t.somma_voci).toBe(2400);
    expect(t.imponibile_lordo).toBe(3000);
    expect(t.totale_iva_inclusa).toBeCloseTo(3300, 6);
  });

  it("vuoto, zero o non valido: si torna alla somma delle voci, come prima", () => {
    const voci = [serramento({ prezzo_totale: 1914 }), serramento({ prezzo_totale: 528 })];
    const acc = [accessorio({ prezzo_totale: 150 })];
    const senza = calcolaTotale(voci, acc, { iva_percentuale: 10 });
    for (const prezzo of [null, undefined, 0, -100, Number.NaN]) {
      const t = calcolaTotale(voci, acc, { iva_percentuale: 10, prezzo_manuale: prezzo });
      expect(t.prezzo_manuale).toBe(false);
      expect(t.imponibile_lordo).toBe(2592);
      expect(t.totale_iva_inclusa).toBeCloseTo(senza.totale_iva_inclusa, 6);
    }
  });

  it("IVA mista: il prezzo scritto si ripartisce come le voci, e la regola dei beni significativi resta giusta", () => {
    // Voci: serramenti 1.690, complementi 1.270, posa e opere 1.550 (l'esempio di calcolaIvaMista).
    // Prezzo scritto 9.020 = il doppio: ogni categoria raddoppia.
    const t = calcolaTotale(
      [serramento({ prezzo_totale: 1690 })],
      [accessorio({ prezzo_totale: 1270 })],
      { iva_percentuale: IVA_MISTA_SENTINEL, prezzo_manuale: 9020 },
      [servizio({ prezzo_totale_vendita: 1550 })],
    );
    // serramenti 3.380 ≤ altre prestazioni 5.640 → tutto al 10%
    expect(t.mista_breakdown?.imponibile_10).toBeCloseTo(9020, 6);
    expect(t.mista_breakdown?.imponibile_22).toBeCloseTo(0, 6);
    expect(t.iva_importo).toBeCloseTo(902, 6);
  });

  it("IVA mista con tutte le voci a 0 €: non c'è niente da ripartire, e l'IVA non si abbassa per errore", () => {
    // Senza posa né complementi con un prezzo, la regola dice: tutto il bene
    // significativo oltre le altre prestazioni (0) al 22%. La fase Economia non
    // lascia scegliere l'IVA mista in questo caso; qui si controlla solo che il
    // conto non esca al 10% per sbaglio.
    const t = calcolaTotale(finestreSenzaPrezzo, zanzariera, { iva_percentuale: IVA_MISTA_SENTINEL, prezzo_manuale: 5000 });
    expect(t.mista_breakdown?.imponibile_22).toBeCloseTo(5000, 6);
    expect(t.iva_importo).toBeCloseTo(1100, 6);
  });

  it("i totali salvati sul preventivo seguono il prezzo scritto: li leggono elenco, cliente e commessa", () => {
    const detail = { serramenti: finestreSenzaPrezzo, accessori: zanzariera };
    const totali = totaliDelPreventivo(detail, { iva_percentuale: 10, sconto_percentuale: 5, prezzo_manuale: 10000 });
    // 10.000 − 5% = 9.500; + 10% = 10.450
    expect(totali.totale_min).toBe(10450);
    expect(totali.totale_max).toBe(10450);
    expect(totali.totale_serramenti).toBe(3);

    // Senza prezzo scritto e con le voci a 0 € il totale è 0: il caso di oggi.
    expect(totaliDelPreventivo(detail, { iva_percentuale: 10 }).totale_max).toBe(0);
  });
});

// Gli otto moduli edili hanno ciascuno la propria copia di calcTotaliComputo:
// le stesse prove girano su tutte, così una copia rimasta indietro si vede.
const MODULI_EDILI = [
  ["ristrutturazione", calcRistrutturazione],
  ["bagni", calcBagni],
  ["tetti", calcTetti],
  ["climatizzazione", calcClimatizzazione],
  ["elettrico", calcElettrico],
  ["termoidraulico", calcTermoidraulico],
  ["pavimenti", calcPavimenti],
  ["piscine", calcPiscine],
] as const;

describe.each(MODULI_EDILI)("Il prezzo scritto a mano nei moduli edili (%s)", (_modulo, calcTotaliComputo) => {
  const riga = (capitolo: string, extra: Partial<{ quantita: number; prezzo_unitario: number; sconto_pct: number; costo_materiali: number; costo_manodopera: number }> = {}) => ({
    capitolo_nome: capitolo, quantita: 1, prezzo_unitario: 0, sconto_pct: 0, costo_materiali: 0, costo_manodopera: 0, ...extra,
  });

  it("prende il posto della somma delle righe; sconto globale e IVA si calcolano sopra", () => {
    // Righe tutte a 0 €, come chi non carica i prezzi: 12.000 − 5% = 11.400; + 10% = 12.540
    const t = calcTotaliComputo([riga("Demolizioni"), riga("Impianti", { quantita: 3 })], {
      sconto_pct: 5, iva_pct: 10, prezzo_manuale: 12000,
    });
    expect(t.sommaVoci).toBe(0);
    expect(t.prezzoManuale).toBe(true);
    expect(t.imponibileLordo).toBe(12000);
    expect(t.imponibile).toBeCloseTo(11400, 6);
    expect(t.iva).toBeCloseTo(1140, 6);
    expect(t.totale).toBeCloseTo(12540, 6);
    // I capitoli restano quelli delle righe: servono al documento, non al prezzo.
    expect(t.perCapitolo.map((c) => c.nome)).toEqual(["Demolizioni", "Impianti"]);
  });

  it("il margine è il prezzo scritto meno i costi di tutte le righe, anche quelle a 0 €", () => {
    const t = calcTotaliComputo([riga("Opere", { quantita: 2, costo_materiali: 1000, costo_manodopera: 500 })], {
      sconto_pct: 0, iva_pct: 22, prezzo_manuale: 5000,
    });
    expect(t.costoTot).toBe(3000);
    expect(t.margineEur).toBe(2000);
    expect(t.marginePct).toBeCloseTo(40, 6);
  });

  it("vuoto, zero o non valido: si torna alla somma delle righe, come prima", () => {
    const righe = [riga("A", { quantita: 2, prezzo_unitario: 100 }), riga("B", { prezzo_unitario: 50, sconto_pct: 10 })];
    const prima = calcTotaliComputo(righe, { sconto_pct: 10, iva_pct: 22 });
    for (const prezzo of [null, undefined, 0, -5, Number.NaN]) {
      const t = calcTotaliComputo(righe, { sconto_pct: 10, iva_pct: 22, prezzo_manuale: prezzo });
      expect(t.prezzoManuale).toBe(false);
      expect(t.imponibileLordo).toBeCloseTo(245, 6); // 200 + 45
      expect(t.totale).toBeCloseTo(prima.totale, 6);
    }
  });
});

describe("Il prezzo scritto a mano nel preventivo generico (QuoteBuilder)", () => {
  // Qui l'IVA è per riga (aliquote miste), non un'unica percentuale come nei
  // moduli: col prezzo scritto a mano serve un'aliquota esplicita a parte.
  const riga = (vat_rate: number, extra: Partial<{ quantity: number; unit_price: number; discount_percent: number; prezzo_acquisto: number; is_optional: boolean }> = {}) => ({
    quantity: 1, unit_price: 0, discount_percent: 0, vat_rate, prezzo_acquisto: 0, is_optional: false, ...extra,
  });

  it("prende il posto della somma delle righe; sconto globale e un'unica aliquota esplicita si calcolano sopra", () => {
    // Righe a 0 € con aliquote miste (22% e 10%): niente da ripartire, serve l'aliquota esplicita.
    // 12.000 − 5% = 11.400; + 10% = 12.540
    const t = calcolaTotaliPreventivo([riga(22), riga(10)], 0, 5, 12000, 10);
    expect(t.somma_voci).toBe(0);
    expect(t.prezzo_manuale).toBe(true);
    expect(t.subtotale).toBe(12000);
    expect(t.subtotale_netto).toBeCloseTo(11400, 6);
    expect(t.iva_breakdown).toEqual({ "10": 1140 });
    expect(t.totale).toBeCloseTo(12540, 6);
  });

  it("il margine è il prezzo scritto meno i costi reali di tutte le righe, anche quelle a 0 €", () => {
    const t = calcolaTotaliPreventivo([riga(22, { quantity: 2, prezzo_acquisto: 750 })], 0, 0, 5000, 22);
    expect(t.costo_totale).toBe(1500);
    expect(t.margine_totale_pct).toBeCloseTo(70, 6); // (5000-1500)/5000
  });

  it("vuoto, zero o non valido: si torna alla somma delle righe con l'IVA per aliquota, come prima", () => {
    const righe = [riga(22, { quantity: 2, unit_price: 100 }), riga(10, { unit_price: 50, discount_percent: 10 })];
    const prima = calcolaTotaliPreventivo(righe, 0, 10);
    for (const prezzo of [null, undefined, 0, -5, Number.NaN]) {
      const t = calcolaTotaliPreventivo(righe, 0, 10, prezzo, 22);
      expect(t.prezzo_manuale).toBe(false);
      expect(t.subtotale).toBeCloseTo(245, 6); // 200 + 45
      expect(t.totale).toBeCloseTo(prima.totale, 6);
    }
  });

  it("un'aliquota mancante o non valida vale 0%: niente IVA finché non viene scelta", () => {
    const t = calcolaTotaliPreventivo([riga(22)], 0, 0, 12000, undefined);
    expect(t.iva_breakdown).toEqual({ "0": 0 });
    expect(t.totale).toBe(12000);
  });
});

describe("Il campo del prezzo", () => {
  it("legge il numero scritto: vuoto, zero o testo = nessun prezzo", () => {
    expect(prezzoDaTesto("8000")).toBe(8000);
    expect(prezzoDaTesto(" 8500,5 ")).toBe(8500.5);
    expect(prezzoDaTesto("1234.567")).toBe(1234.57);
    for (const testo of ["", "  ", "0", "-3", "abc"]) expect(prezzoDaTesto(testo)).toBeNull();
  });
});
