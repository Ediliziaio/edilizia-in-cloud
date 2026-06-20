import type { VoceSim, FaseSim, ScenariConfig, RiepilogoIvaRiga } from "./tipi";

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function calcolaVoce(v: VoceSim) {
  const imponibile_costo = round2(v.quantita * v.costo_unitario);
  const imponibile_ricavo = round2(v.quantita * v.prezzo_unitario);
  return { imponibile_costo, imponibile_ricavo, margine: round2(imponibile_ricavo - imponibile_costo) };
}

export function calcolaTotali(voci: VoceSim[]) {
  let costo_totale = 0, ricavo_imponibile = 0;
  for (const v of voci) {
    const r = calcolaVoce(v);
    costo_totale += r.imponibile_costo;
    ricavo_imponibile += r.imponibile_ricavo;
  }
  costo_totale = round2(costo_totale);
  ricavo_imponibile = round2(ricavo_imponibile);
  const margine_valore = round2(ricavo_imponibile - costo_totale);
  const margine_pct = ricavo_imponibile > 0 ? round2((margine_valore / ricavo_imponibile) * 100) : 0;
  return { costo_totale, ricavo_imponibile, margine_valore, margine_pct };
}

/**
 * calcolaIva — riepilogo IVA dell'imponibile ricavo, per aliquota.
 *
 * - `iva_mode === "singola"`: tutto l'imponibile ricavo a `iva_rate_singola`,
 *   un'unica riga di riepilogo.
 * - `iva_mode === "mista"`: accumula per `vat_rate` di riga. Per le voci con
 *   `bene_significativo`, applica la regola dei beni significativi: con
 *   `B = imponibile_ricavo` e `posa = valore_posa_associata ?? 0`, si aggiunge
 *   `posa + min(B, posa)` all'aliquota agevolata 10% e `max(0, B − posa)` al 22%
 *   (invece di tutto B alla sua `vat_rate`).
 *
 * `fattoreSconto` (default 1): scala proporzionalmente ogni imponibile prima del
 * calcolo dell'imposta, così l'IVA e il prezzo cliente si applicano al ricavo
 * NETTO (scontato) anziché al lordo, mantenendo coerente il riparto fra aliquote
 * anche in IVA mista. Con fattore 1 il comportamento è invariato.
 *
 * Per ogni riga di riepilogo `imposta = round2(imponibile × aliquota / 100)`,
 * ordinata per aliquota crescente; `iva_totale = round2(somma imposte)`.
 */
export function calcolaIva(
  voci: VoceSim[],
  scenari: ScenariConfig,
  fattoreSconto = 1,
): { riepilogo_iva: RiepilogoIvaRiga[]; iva_totale: number } {
  // Imponibile ricavo accumulato per aliquota.
  const perAliquota = new Map<number, number>();
  const add = (aliquota: number, imponibile: number) => {
    if (imponibile === 0) return;
    perAliquota.set(aliquota, round2((perAliquota.get(aliquota) ?? 0) + imponibile));
  };

  if (scenari.iva_mode === "singola") {
    const { ricavo_imponibile } = calcolaTotali(voci);
    perAliquota.set(scenari.iva_rate_singola, ricavo_imponibile);
  } else {
    for (const v of voci) {
      const { imponibile_ricavo: B } = calcolaVoce(v);
      if (v.bene_significativo) {
        const posa = v.valore_posa_associata ?? 0;
        add(10, round2(posa + Math.min(B, posa)));
        add(22, round2(Math.max(0, B - posa)));
      } else {
        add(v.vat_rate, B);
      }
    }
  }

  const riepilogo_iva: RiepilogoIvaRiga[] = [...perAliquota.entries()]
    .map(([aliquota, imponibile]) => {
      const scontato = round2(imponibile * fattoreSconto);
      return {
        aliquota,
        imponibile: scontato,
        imposta: round2((scontato * aliquota) / 100),
      };
    })
    .sort((a, b) => a.aliquota - b.aliquota);

  const iva_totale = round2(riepilogo_iva.reduce((acc, r) => acc + r.imposta, 0));
  return { riepilogo_iva, iva_totale };
}

export interface EconomiaInput {
  /** Somma costi voci. */
  costo_diretto: number;
  /** Somma prezzi voci (imponibile prima dello sconto). */
  ricavo_lordo: number;
  spese_generali_pct: number;
  utile_pct: number;
  sconto_pct: number;
}

export interface EconomiaRisultato {
  spese_generali: number;
  costo_pieno: number;
  sconto_valore: number;
  ricavo_netto: number;
  margine_netto_valore: number;
  margine_netto_pct: number;
  utile_target: number;
}

/**
 * calcolaEconomia — modello economico "spese generali / utile / sconto".
 *
 * - `spese_generali` = costo_diretto × spese_generali_pct/100.
 * - `costo_pieno` = costo_diretto + spese_generali.
 * - `sconto_valore` = ricavo_lordo × sconto_pct/100.
 * - `ricavo_netto` = ricavo_lordo − sconto_valore (imponibile effettivo).
 * - `margine_netto_valore` = ricavo_netto − costo_pieno; `margine_netto_pct` su
 *   ricavo_netto (0 se ricavo_netto ≤ 0, niente NaN).
 * - `utile_target` = costo_pieno × utile_pct/100 (utile d'impresa atteso).
 *
 * Funzione pura: nessuna dipendenza da IVA o voci, solo aritmetica arrotondata.
 */
export function calcolaEconomia(input: EconomiaInput): EconomiaRisultato {
  const spese_generali = round2((input.costo_diretto * input.spese_generali_pct) / 100);
  const costo_pieno = round2(input.costo_diretto + spese_generali);
  const sconto_valore = round2((input.ricavo_lordo * input.sconto_pct) / 100);
  const ricavo_netto = round2(input.ricavo_lordo - sconto_valore);
  const margine_netto_valore = round2(ricavo_netto - costo_pieno);
  const margine_netto_pct =
    ricavo_netto > 0 ? round2((margine_netto_valore / ricavo_netto) * 100) : 0;
  const utile_target = round2((costo_pieno * input.utile_pct) / 100);
  return {
    spese_generali,
    costo_pieno,
    sconto_valore,
    ricavo_netto,
    margine_netto_valore,
    margine_netto_pct,
    utile_target,
  };
}

/**
 * calcolaPrezzoObiettivo — helper INVERSO: dato un prezzo netto desiderato,
 * calcola lo sconto% necessario sul lordo e il margine risultante.
 *
 * - `sconto_pct_necessario` = ricavo_lordo>0 ? (ricavo_lordo − P)/ricavo_lordo×100 : 0.
 * - `margine_valore` = P − costo_pieno.
 * - `margine_pct` = P>0 ? margine_valore/P×100 : 0.
 */
export function calcolaPrezzoObiettivo(
  costo_pieno: number,
  ricavo_lordo: number,
  prezzoObiettivoNetto: number,
): { margine_valore: number; margine_pct: number; sconto_pct_necessario: number } {
  const sconto_pct_necessario =
    ricavo_lordo > 0
      ? round2(((ricavo_lordo - prezzoObiettivoNetto) / ricavo_lordo) * 100)
      : 0;
  const margine_valore = round2(prezzoObiettivoNetto - costo_pieno);
  const margine_pct =
    prezzoObiettivoNetto > 0 ? round2((margine_valore / prezzoObiettivoNetto) * 100) : 0;
  return { margine_valore, margine_pct, sconto_pct_necessario };
}

export interface FaseCalcolata {
  fase_id: string;
  costo: number;
  manodopera_costo: number;
  inizio: number;
  durata: number;
}

/**
 * calcolaFasi — aggrega costi e tempistiche per fase del cronoprogramma.
 *
 * Per ogni fase: `costo` = somma `imponibile_costo` delle voci con
 * `fase_id === fase.id`; `manodopera_costo` = idem ma solo voci `is_manodopera`;
 * `inizio`/`durata` dai campi offset/durata della fase.
 *
 * `durata_settimane` totale = max(`inizio_offset_settimane + durata_settimane`)
 * su tutte le fasi (0 se nessuna fase).
 */
export function calcolaFasi(
  fasi: FaseSim[],
  voci: VoceSim[],
): { perFase: FaseCalcolata[]; durata_settimane: number } {
  const perFase: FaseCalcolata[] = fasi.map((fase) => {
    let costo = 0;
    let manodopera_costo = 0;
    for (const v of voci) {
      if (v.fase_id !== fase.id) continue;
      const { imponibile_costo } = calcolaVoce(v);
      costo += imponibile_costo;
      if (v.is_manodopera) manodopera_costo += imponibile_costo;
    }
    return {
      fase_id: fase.id,
      costo: round2(costo),
      manodopera_costo: round2(manodopera_costo),
      inizio: fase.inizio_offset_settimane,
      durata: fase.durata_settimane,
    };
  });

  const durata_settimane = fasi.reduce(
    (max, f) => Math.max(max, f.inizio_offset_settimane + f.durata_settimane),
    0,
  );

  return { perFase, durata_settimane };
}
