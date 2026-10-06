/**
 * I totali che il preventivo Serramenti tiene sulla sua riga (06/10/2026): li leggono l'elenco, le opportunità e la
 * commessa (sr_converti_in_ordine prende totale_max), e quelli che «Invia per firma» scrive nel documento di firma.
 * Gli attesi sono calcolati a mano, in centesimi.
 */
import { describe, expect, it } from "vitest";
import { IVA_MISTA_SENTINEL } from "@/lib/serramenti/calcoli";
import { detrazioneCambiata, detrazioneDelPreventivo, importiDelPreventivo, totaliCambiati, totaliDelPreventivo } from "@/lib/serramenti/righePreventivo";
import type { SrAccessorioRow, SrSerramentoRow, SrServizioRow } from "@/types/serramenti";

const finestra = (extra: Partial<SrSerramentoRow>) =>
  ({ quantita: 1, prezzo_unitario: null, prezzo_totale: null, larghezza_mm: 1000, altezza_mm: 1000, metri_quadri: null, ...extra }) as SrSerramentoRow;
const accessorio = (extra: Partial<SrAccessorioRow>) =>
  ({ quantita: 1, prezzo_unitario: null, prezzo_totale: null, ...extra }) as SrAccessorioRow;
const servizio = (extra: Partial<SrServizioRow>) =>
  ({ quantita: 1, prezzo_unitario_vendita: null, prezzo_totale_vendita: null, ...extra }) as SrServizioRow;

/** Centesimi interi: così si confronta senza i decimali dei float. */
const cent = (euro: number) => Math.round(euro * 100);

describe("i totali che il preventivo tiene sulla sua riga (la «forbice»)", () => {
  const detail = {
    serramenti: [finestra({ quantita: 2, prezzo_totale: 2500, metri_quadri: 3.36 }), finestra({ prezzo_totale: 1340.5, metri_quadri: 1 })],
    accessori: [accessorio({ prezzo_totale: 300 })],
    servizi: [servizio({ prezzo_totale_vendita: 150 })],
  };

  it("minimo e massimo coincidono col totale ricalcolato dalle righe, al centesimo", () => {
    // 4.290,50 − 7,5% = 3.968,7125; IVA 10% = 396,87125; totale 4.365,58375 → 4.365,58.
    const t = totaliDelPreventivo(detail, { iva_percentuale: 10, sconto_percentuale: 7.5 });
    expect(t.totale_min).toBe(4365.58);
    expect(t.totale_max).toBe(4365.58);
    expect(t.totale_serramenti).toBe(3);
    expect(t.totale_accessori).toBe(1);
    expect(t.metri_quadri_totali).toBe(4.36);
  });

  it("segue ogni tipo di modifica: riga, complemento, servizio, sconto, IVA e prezzo scritto a mano", () => {
    const base = totaliDelPreventivo(detail, { iva_percentuale: 10 }).totale_max;
    expect(base).toBe(4719.55);
    const piu = (extra: Partial<typeof detail>) => totaliDelPreventivo({ ...detail, ...extra }, { iva_percentuale: 10 }).totale_max;
    expect(piu({ serramenti: [...detail.serramenti, finestra({ prezzo_totale: 100 })] })).toBe(4829.55); // +100 +10%
    expect(piu({ accessori: [] })).toBe(4389.55); // −300 −10%
    expect(piu({ servizi: [] })).toBe(4554.55); // −150 −10%
    expect(totaliDelPreventivo(detail, { iva_percentuale: 22 }).totale_max).toBe(5234.41); // 4.290,50 × 1,22
    expect(totaliDelPreventivo(detail, { iva_percentuale: 10, sconto_importo: 100 }).totale_max).toBe(4609.55); // −100 −10%
    expect(totaliDelPreventivo(detail, { iva_percentuale: 10, prezzo_manuale: 6000 }).totale_max).toBe(6600);
  });

  it("senza IVA indicata vale il 10% e col prezzo scritto a mano si parte da quello", () => {
    expect(totaliDelPreventivo({ serramenti: [finestra({ prezzo_totale: 0 })], accessori: [] }, { prezzo_manuale: 8000 }).totale_max).toBe(8800);
  });

  it("si riscrive ogni differenza di un centesimo: l'elenco e la commessa non restano indietro", () => {
    const calcolati = totaliDelPreventivo(detail, { iva_percentuale: 10 });
    // Salvato uguale: niente da scrivere.
    expect(totaliCambiati({ totale_min: 4719.55, totale_max: 4719.55, totale_serramenti: 3, totale_accessori: 1, metri_quadri_totali: 4.36 }, calcolati)).toEqual({});
    // Un ritocco di 40 centesimi (un complemento da 300,00 a 300,36 con IVA…): il totale salvato deve seguirlo.
    const ritoccato = totaliDelPreventivo({ ...detail, accessori: [accessorio({ prezzo_totale: 300.4 })] }, { iva_percentuale: 10 });
    expect(ritoccato.totale_max).toBe(4719.99); // 4.290,90 × 1,10 = 4.719,99
    const daScrivere = totaliCambiati({ totale_min: 4719.55, totale_max: 4719.55, totale_serramenti: 3, totale_accessori: 1, metri_quadri_totali: 4.36 }, ritoccato);
    expect(daScrivere).toEqual({ totale_min: 4719.99, totale_max: 4719.99 });
  });

  it("il rumore dei float sotto il centesimo non è una modifica", () => {
    const calcolati = totaliDelPreventivo(detail, { iva_percentuale: 10 });
    expect(totaliCambiati({ totale_min: 4719.550000001, totale_max: 4719.549999999, totale_serramenti: 3, totale_accessori: 1, metri_quadri_totali: 4.36 }, calcolati)).toEqual({});
  });

  it("un totale mai salvato, o una vecchia forbice, si riscrive", () => {
    const calcolati = totaliDelPreventivo(detail, { iva_percentuale: 10 });
    expect(totaliCambiati({ totale_min: null, totale_max: null }, calcolati)).toMatchObject({ totale_min: 4719.55, totale_max: 4719.55 });
    expect(totaliCambiati({ totale_min: 3600, totale_max: 4400 }, calcolati)).toMatchObject({ totale_min: 4719.55, totale_max: 4719.55 });
  });
});

describe("importiDelPreventivo — imponibile, IVA e totale per chi li riceve (invio per firma)", () => {
  const detail = { serramenti: [finestra({ prezzo_totale: 5000 })], accessori: [accessorio({ prezzo_totale: 1200 })], servizi: [servizio({ prezzo_totale_vendita: 800 })] };

  it("aliquota unica: imponibile + IVA = totale", () => {
    const i = importiDelPreventivo(detail, { iva_percentuale: 10, sconto_percentuale: 10 });
    // 7.000 − 10% = 6.300; IVA 630; totale 6.930.
    expect(i).toEqual({ imponibile: 6300, iva: 630, totale: 6930 });
  });

  it("IVA mista: l'IVA è la somma delle quote, mai negativa, e l'imponibile sta sotto il totale", () => {
    // 7.000 di imponibile, IVA 1.060, totale 8.060 (vedi il caso a mano sopra).
    const i = importiDelPreventivo(detail, { iva_percentuale: IVA_MISTA_SENTINEL });
    expect(i).toEqual({ imponibile: 7000, iva: 1060, totale: 8060 });
  });

  it("anche con centesimi che non tornano la somma è esatta e il totale resta quello del preventivo", () => {
    const d = { serramenti: [finestra({ prezzo_totale: 1234.56 })], accessori: [] as SrAccessorioRow[], servizi: [] as SrServizioRow[] };
    const i = importiDelPreventivo(d, { iva_percentuale: 10, sconto_percentuale: 7.5 });
    expect(i.totale).toBe(totaliDelPreventivo(d, { iva_percentuale: 10, sconto_percentuale: 7.5 }).totale_max);
    expect(cent(i.imponibile) + cent(i.iva)).toBe(cent(i.totale));
  });
});


describe("detrazione scritta sul preventivo: segue il totale di adesso", () => {
  it("50% sul totale IVA inclusa: 7.700 → 3.850 in dieci quote da 385", () => {
    expect(detrazioneDelPreventivo(50, 7700)).toEqual({ detrazione_eur_totale: 3850, detrazione_eur_anno: 385 });
  });

  it("36% su 10.000 → 3.600 e 360; il massimale di 96.000 taglia la base (120.000 → 48.000 e 4.800)", () => {
    expect(detrazioneDelPreventivo(36, 10000)).toEqual({ detrazione_eur_totale: 3600, detrazione_eur_anno: 360 });
    expect(detrazioneDelPreventivo(50, 120000)).toEqual({ detrazione_eur_totale: 48000, detrazione_eur_anno: 4800 });
  });

  it("senza aliquota (vuota, 0 = esclusa di proposito, testo) non c'è niente da allineare", () => {
    for (const aliquota of [null, undefined, 0, "", "abc", -5]) expect(detrazioneDelPreventivo(aliquota, 7700)).toBeNull();
  });

  it("un totale a 0 porta la detrazione a 0, mai negativa né NaN", () => {
    expect(detrazioneDelPreventivo(50, 0)).toEqual({ detrazione_eur_totale: 0, detrazione_eur_anno: 0 });
    expect(detrazioneDelPreventivo(50, Number.NaN)).toEqual({ detrazione_eur_totale: 0, detrazione_eur_anno: 0 });
  });

  it("si riscrivono solo i campi diversi di un centesimo o più", () => {
    const calcolata = { detrazione_eur_totale: 3850, detrazione_eur_anno: 385 };
    expect(detrazioneCambiata({ detrazione_eur_totale: 3850, detrazione_eur_anno: 385 }, calcolata)).toEqual({});
    expect(detrazioneCambiata({ detrazione_eur_totale: "3850.00", detrazione_eur_anno: 385.004 }, calcolata)).toEqual({});
    expect(detrazioneCambiata({ detrazione_eur_totale: 5500, detrazione_eur_anno: 385 }, calcolata)).toEqual({ detrazione_eur_totale: 3850 });
    expect(detrazioneCambiata({ detrazione_eur_totale: null, detrazione_eur_anno: null }, calcolata)).toEqual(calcolata);
  });
});
