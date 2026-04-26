/**
 * Motore finanziario FV — Wave 1.
 * Riferimento: §19-26 del masterprompt.
 *
 * Calcola: cassa cumulata 25 anni, payback, NPV, IRR, sensitivity ±15%,
 * what-if (auto elettrica + pompa calore), confronto BTP/deposito.
 */

import { produzioneAnnoN } from "./fisica";

// ─── Cassa cumulata 25 anni (§19) ───────────────────────────────────────────

export interface InputCassaCumulata {
  /** Investimento iniziale (positivo, sarà segnato come negativo all'anno 0). */
  investimento_iniziale: number;
  produzione_anno_1_kwh: number;
  autoconsumo_pct: number;
  costo_kwh_attuale: number;
  prezzo_rid_kwh: number;
  /** Detrazione annua (€/anno) per anni 1..durata_detrazione. */
  detrazione_annua_eur: number;
  durata_detrazione_anni: number;
  /** Inflazione costo energia (decimale, es. 0.025 = 2.5% annuo). */
  inflazione_energia_pct: number;
  /** Inflazione tariffa RID (di solito più contenuta, es. 0.02). */
  inflazione_rid_pct?: number;
  /** Degradazione annua pannelli (es. 0.005 = -0.5%/anno). */
  degradazione_pannelli_pct: number;
  /** Costo manutenzione annua (€/kWp/anno × kWp). */
  costo_manutenzione_anno_eur: number;
  /** Costo sostituzione inverter (anno 12 default). */
  costo_sostituzione_inverter_eur: number;
  anno_sostituzione_inverter?: number;
  orizzonte_anni?: number;
}

export interface FlussoAnno {
  anno: number;
  flusso: number;
  cumulato: number;
  produzione_kwh: number;
  risparmio_bolletta_eur: number;
  ricavi_rid_eur: number;
  detrazione_eur: number;
  manutenzione_eur: number;
  sostituzione_inverter_eur: number;
}

/**
 * Genera il flusso anno-per-anno per 25 anni (default).
 * Anno 0 = -investimento. Anni 1..25 = risparmio + RID + detrazione - manutenzione
 * - sostituzione inverter (se applicabile).
 */
export function calcolaCassaCumulata(input: InputCassaCumulata): FlussoAnno[] {
  const orizzonte = input.orizzonte_anni ?? 25;
  const annoSostInv = input.anno_sostituzione_inverter ?? 12;
  const inflRid = input.inflazione_rid_pct ?? 0.02;

  const flussi: FlussoAnno[] = [];
  let cumulato = 0;

  for (let anno = 0; anno <= orizzonte; anno++) {
    if (anno === 0) {
      const flusso = -input.investimento_iniziale;
      cumulato += flusso;
      flussi.push({
        anno,
        flusso: round2(flusso),
        cumulato: round2(cumulato),
        produzione_kwh: 0,
        risparmio_bolletta_eur: 0,
        ricavi_rid_eur: 0,
        detrazione_eur: 0,
        manutenzione_eur: 0,
        sostituzione_inverter_eur: 0,
      });
      continue;
    }

    // Produzione anno N (con degradazione)
    const produzione_n = produzioneAnnoN(
      input.produzione_anno_1_kwh,
      anno,
      input.degradazione_pannelli_pct
    );

    // Prezzi inflazionati
    const prezzo_kwh_n =
      input.costo_kwh_attuale * Math.pow(1 + input.inflazione_energia_pct, anno - 1);
    const prezzo_rid_n =
      input.prezzo_rid_kwh * Math.pow(1 + inflRid, anno - 1);

    // Energia & risparmi
    const autoconsumata = produzione_n * input.autoconsumo_pct;
    const immessa = produzione_n - autoconsumata;

    const risparmio_bolletta = autoconsumata * prezzo_kwh_n;
    const ricavi_rid = immessa * prezzo_rid_n;

    // Detrazione (solo anni 1..durata_detrazione)
    const detrazione_n =
      anno <= input.durata_detrazione_anni ? input.detrazione_annua_eur : 0;

    // Manutenzione (sempre)
    const manutenzione = input.costo_manutenzione_anno_eur;

    // Sostituzione inverter (solo anno 12)
    const sostituzione_inverter =
      anno === annoSostInv ? input.costo_sostituzione_inverter_eur : 0;

    const flusso =
      risparmio_bolletta +
      ricavi_rid +
      detrazione_n -
      manutenzione -
      sostituzione_inverter;

    cumulato += flusso;

    flussi.push({
      anno,
      flusso: round2(flusso),
      cumulato: round2(cumulato),
      produzione_kwh: round2(produzione_n),
      risparmio_bolletta_eur: round2(risparmio_bolletta),
      ricavi_rid_eur: round2(ricavi_rid),
      detrazione_eur: round2(detrazione_n),
      manutenzione_eur: round2(manutenzione),
      sostituzione_inverter_eur: round2(sostituzione_inverter),
    });
  }

  return flussi;
}

// ─── Payback (§20.1) ────────────────────────────────────────────────────────

/**
 * Anno (frazionario) in cui il cumulato passa da negativo a positivo.
 * Se l'investimento non rientra mai, ritorna null.
 */
export function calcolaPayback(cassa: FlussoAnno[]): number | null {
  for (let i = 1; i < cassa.length; i++) {
    if (cassa[i].cumulato >= 0) {
      const prev = cassa[i - 1].cumulato;
      const curr = cassa[i].cumulato;
      if (curr === prev) return cassa[i].anno;
      const interp = -prev / (curr - prev);
      return round1(cassa[i].anno - 1 + interp);
    }
  }
  return null;
}

// ─── NPV (§20.2) ────────────────────────────────────────────────────────────

/**
 * Net Present Value: somma flussi scontati al tasso r.
 * Convenzione: anno 0 (investimento) NON viene scontato.
 */
export function calcolaNPV(cassa: FlussoAnno[], tasso = 0.04): number {
  const npv = cassa.reduce(
    (sum, x) => sum + x.flusso / Math.pow(1 + tasso, x.anno),
    0
  );
  return round2(npv);
}

// ─── IRR (§20.3) — Newton-Raphson ──────────────────────────────────────────

/**
 * Internal Rate of Return: tasso che rende NPV = 0.
 * Usa Newton-Raphson con guess iniziale 10%, max 100 iterazioni, tolleranza 1e-4.
 */
export function calcolaIRR(
  cassa: FlussoAnno[],
  guess = 0.1,
  maxIter = 100,
  tol = 1e-4
): number | null {
  let r = guess;
  for (let iter = 0; iter < maxIter; iter++) {
    const npv = cassa.reduce(
      (sum, x) => sum + x.flusso / Math.pow(1 + r, x.anno),
      0
    );
    const dNpv = cassa.reduce(
      (sum, x) => sum - (x.anno * x.flusso) / Math.pow(1 + r, x.anno + 1),
      0
    );
    if (Math.abs(dNpv) < 1e-10) break;
    const r_new = r - npv / dNpv;
    if (Math.abs(r_new - r) < tol) {
      // sanity check: IRR plausibile (tra -50% e 100%)
      if (r_new < -0.5 || r_new > 1) return null;
      return round4(r_new);
    }
    r = r_new;
  }
  return null;
}

// ─── Capienza IRPEF (§18) ───────────────────────────────────────────────────

/**
 * Calcolo IRPEF lorda 2026 secondo scaglioni post-riforma:
 *   0-28k     → 23%
 *   28k-50k   → 35%
 *   oltre 50k → 43%
 */
export function calcolaIrpefLorda(reddito_imponibile: number): number {
  if (reddito_imponibile <= 0) return 0;
  if (reddito_imponibile <= 28000) return reddito_imponibile * 0.23;
  if (reddito_imponibile <= 50000) {
    return 28000 * 0.23 + (reddito_imponibile - 28000) * 0.35;
  }
  return 28000 * 0.23 + 22000 * 0.35 + (reddito_imponibile - 50000) * 0.43;
}

/**
 * Stima detrazioni base per lavoratore dipendente (semplificata W1).
 * In W2 introdurremo input granulare per familiari a carico, mutuo, ecc.
 */
export function stimaDetrazioniBase(reddito_imponibile: number): number {
  if (reddito_imponibile <= 15000) return 1880;
  if (reddito_imponibile <= 28000) {
    return 1880 + (1910 - 1880) * ((reddito_imponibile - 15000) / 13000);
  }
  if (reddito_imponibile <= 50000) {
    return Math.max(0, 1910 * ((50000 - reddito_imponibile) / 22000));
  }
  return 0;
}

/**
 * Verifica capienza IRPEF (§18.3).
 *   detrazione_totale = costo × aliquota (es. 50%)
 *   detrazione_annua  = detrazione_totale / 10
 *   capienza_residua  = irpef_netta - altre_detrazioni
 *   recupero_pct      = min(detrazione_annua, capienza_residua) / detrazione_annua
 */
export function verificaCapienzaIrpef(input: {
  costo_lavoro_eur: number;
  aliquota_detrazione: number;
  reddito_annuo_lordo: number;
  altre_detrazioni_eur?: number;
}): {
  capienza_ok: boolean;
  recupero_pct: number;
  detrazione_annua: number;
  detrazione_recuperabile_anno: number;
  detrazione_persa_anno: number;
  detrazione_persa_totale: number;
  warning: string | null;
} {
  const detrazione_totale = input.costo_lavoro_eur * input.aliquota_detrazione;
  const detrazione_annua = detrazione_totale / 10;

  const irpef_lorda = calcolaIrpefLorda(input.reddito_annuo_lordo);
  const detrazioni_base = stimaDetrazioniBase(input.reddito_annuo_lordo);
  const altre_detrazioni = input.altre_detrazioni_eur ?? 0;
  const irpef_netta = Math.max(0, irpef_lorda - detrazioni_base);
  const capienza_residua = Math.max(0, irpef_netta - altre_detrazioni);

  const detrazione_recuperabile = Math.min(detrazione_annua, capienza_residua);
  const recupero_pct =
    detrazione_annua > 0 ? detrazione_recuperabile / detrazione_annua : 0;

  let warning: string | null = null;
  if (recupero_pct < 0.8) {
    warning = "Capienza insufficiente — considera Reddito Energetico o cessione del credito";
  }

  return {
    capienza_ok: recupero_pct >= 1.0,
    recupero_pct: round4(recupero_pct),
    detrazione_annua: round2(detrazione_annua),
    detrazione_recuperabile_anno: round2(detrazione_recuperabile),
    detrazione_persa_anno: round2(detrazione_annua - detrazione_recuperabile),
    detrazione_persa_totale: round2((detrazione_annua - detrazione_recuperabile) * 10),
    warning,
  };
}

// ─── Sensitivity ±15% (§22) ─────────────────────────────────────────────────

/**
 * Ricalcola payback + NPV variando il prezzo dell'energia ±X%.
 * La produzione e gli incentivi restano invariati.
 */
export function applicaSensitivityPrezzoEnergia(
  input_base: InputCassaCumulata,
  delta_pct: number,
  tasso_npv = 0.04
): { payback_anni: number | null; npv: number } {
  const input = {
    ...input_base,
    costo_kwh_attuale: input_base.costo_kwh_attuale * (1 + delta_pct),
  };
  const cassa = calcolaCassaCumulata(input);
  return {
    payback_anni: calcolaPayback(cassa),
    npv: calcolaNPV(cassa, tasso_npv),
  };
}

// ─── What-if scenarios (§23) ────────────────────────────────────────────────

/**
 * Scenario 'Aggiungo auto elettrica entro 3 anni':
 *   - consumo aumenta di X kWh/anno (default 3000)
 *   - autoconsumo % aumenta (perché EV si carica con eccedenze FV)
 */
export function scenarioAutoElettrica(input: {
  base: InputCassaCumulata;
  consumo_extra_kwh?: number;
  delta_autoconsumo_pct?: number; // es. +0.20 con accumulo, +0.30 con wallbox
  tasso_npv?: number;
}): {
  payback_anni: number | null;
  npv: number;
  autoconsumo: number;
} {
  // _extra è il consumo aggiuntivo previsto (auto elettrica): per ora il modello
  // W1 lo modella alzando solo l'autoconsumo (delta), riservato a W2 il calcolo
  // pieno con flussi separati.
  const _extra = input.consumo_extra_kwh ?? 3000;
  void _extra;
  const delta = input.delta_autoconsumo_pct ?? 0.20;
  // Ricalcolo: produzione resta uguale, ma autoconsumo aumenta (capped a 1.0)
  const newAutoconsumo = Math.min(1, input.base.autoconsumo_pct + delta);
  const newInput: InputCassaCumulata = {
    ...input.base,
    autoconsumo_pct: newAutoconsumo,
  };
  const cassa = calcolaCassaCumulata(newInput);
  return {
    payback_anni: calcolaPayback(cassa),
    npv: calcolaNPV(cassa, input.tasso_npv ?? 0.04),
    autoconsumo: newAutoconsumo,
  };
}

/**
 * Scenario 'Aggiungo pompa di calore':
 *   - consumo elettrico aumenta (~3500-4500 kWh/anno)
 *   - sostituisce caldaia gas → risparmio gas (-600€-1000€/anno)
 *   - autoconsumo del FV sale al ~70-95%
 */
export function scenarioPompaCalore(input: {
  base: InputCassaCumulata;
  consumo_extra_kwh?: number;
  risparmio_gas_anno_eur?: number;
  delta_autoconsumo_pct?: number;
  tasso_npv?: number;
}): {
  payback_anni: number | null;
  npv: number;
  autoconsumo: number;
} {
  // _extra → consumo extra elettrico (PdC). Modello W1 lo riassorbe via delta autoconsumo.
  const _extra = input.consumo_extra_kwh ?? 4000;
  void _extra;
  const risparmio_gas = input.risparmio_gas_anno_eur ?? 800;
  const delta = input.delta_autoconsumo_pct ?? 0.30;
  const newAutoconsumo = Math.min(1, input.base.autoconsumo_pct + delta);

  // Modello W1 semplificato: ricalcolo cassa con autoconsumo +delta e
  // aggiungiamo il risparmio gas come "altra entrata" nei flussi.
  const newInput: InputCassaCumulata = {
    ...input.base,
    autoconsumo_pct: newAutoconsumo,
  };
  const cassaBase = calcolaCassaCumulata(newInput);
  // Aggiungo risparmio gas (inflazione 3%) a tutti gli anni > 0
  const cassaPdC: FlussoAnno[] = cassaBase.map((f, idx) => {
    if (idx === 0) return f;
    const inflGas = Math.pow(1.03, f.anno - 1);
    const extraGas = risparmio_gas * inflGas;
    const newFlusso = f.flusso + extraGas;
    return {
      ...f,
      flusso: round2(newFlusso),
      // ricalcolo cumulato in seconda passata
    };
  });
  // Ricalcolo cumulato
  let cum = 0;
  const cassaFinale = cassaPdC.map((f) => {
    cum += f.flusso;
    return { ...f, cumulato: round2(cum) };
  });

  return {
    payback_anni: calcolaPayback(cassaFinale),
    npv: calcolaNPV(cassaFinale, input.tasso_npv ?? 0.04),
    autoconsumo: newAutoconsumo,
  };
}

// ─── Confronto investimenti alternativi (§25) ───────────────────────────────

/**
 * Calcola il montante dopo N anni di un investimento a tasso fisso composto.
 *   M = C × (1 + r)^N
 */
export function montanteCompostoSemplice(
  capitale: number,
  tasso_annuo: number,
  anni: number
): number {
  return round2(capitale * Math.pow(1 + tasso_annuo, anni));
}

export function confrontoInvestimentiAlternativi(input: {
  capitale: number;
  fv_npv_25anni: number;
  fv_risparmio_totale_25anni: number;
  tasso_btp?: number;
  tasso_deposito?: number;
}): {
  fv_montante: number;
  btp: { tasso: number; montante: number; delta_vs_fv: number };
  deposito: { tasso: number; montante: number; delta_vs_fv: number };
  conto_corrente_inflazionato: { montante_reale: number; perdita_inflazione: number };
} {
  const tasso_btp = input.tasso_btp ?? 0.038;
  const tasso_deposito = input.tasso_deposito ?? 0.025;
  const inflazione = 0.03;

  const fv_montante = round2(input.capitale + input.fv_risparmio_totale_25anni);
  const btp_montante = montanteCompostoSemplice(input.capitale, tasso_btp, 25);
  const deposito_montante = montanteCompostoSemplice(
    input.capitale,
    tasso_deposito,
    25
  );
  const cc_reale = round2(input.capitale / Math.pow(1 + inflazione, 25));

  return {
    fv_montante,
    btp: {
      tasso: tasso_btp,
      montante: btp_montante,
      delta_vs_fv: round2(fv_montante - btp_montante),
    },
    deposito: {
      tasso: tasso_deposito,
      montante: deposito_montante,
      delta_vs_fv: round2(fv_montante - deposito_montante),
    },
    conto_corrente_inflazionato: {
      montante_reale: cc_reale,
      perdita_inflazione: round2(input.capitale - cc_reale),
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
