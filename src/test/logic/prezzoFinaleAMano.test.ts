import { describe, expect, it } from "vitest";
import { calcolaTotale, IVA_MISTA_SENTINEL } from "@/lib/serramenti/calcoli";
import { totaliDelPreventivo } from "@/lib/serramenti/righePreventivo";
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
