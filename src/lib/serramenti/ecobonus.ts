/**
 * src/lib/serramenti/ecobonus.ts — calcolo Ecobonus + Cashflow 10 anni.
 *
 * Ecobonus 50% (Bonus Casa, ex-art.16 DL 63/2013):
 *  - Detrazione IRPEF 50% per sostituzione serramenti con riqualificazione
 *    energetica (Uw inferiore a soglie zona climatica).
 *  - Massimo 60.000 € di spesa per unità immobiliare (art.14 DL 63/2013).
 *  - Recupero in 10 quote annuali di pari importo.
 *
 * Ecobonus 65% (Ecobonus tradizionale, art.14):
 *  - Per interventi specifici di riqualificazione energetica significativa.
 *  - Soglie Uw stringenti (zona climatica).
 *  - In molti casi declassato al 50% dal 2025.
 *
 * NOTA: questo modulo serve solo a stimare il vantaggio fiscale. Le aliquote
 * effettive e i requisiti normativi vanno verificati al momento dell'invio
 * della pratica ENEA dal consulente.
 */
export interface InputEcobonus {
  imponibile_eur: number;          // imponibile lavori (no IVA o con IVA, dipende dalla scelta)
  aliquota: 50 | 65;                // % di detrazione
  spesa_massima_eur?: number;       // tetto detraibile (default 60.000 €)
  reddito_irpef_anno?: number;      // imponibile IRPEF annuo del contribuente (per verifica capienza)
}

export interface OutputEcobonus {
  base_calcolo: number;             // min(imponibile, spesa_massima)
  aliquota: number;                 // 50 o 65
  detrazione_totale: number;         // base × aliquota
  rata_annuale: number;              // detrazione / 10
  anni_recupero: number;             // 10
  capienza_ok: boolean | null;       // true se reddito >= rata annua, null se non noto
}

const DEFAULT_TETTO = 60_000;

export function calcolaEcobonus(input: InputEcobonus): OutputEcobonus {
  const tetto = input.spesa_massima_eur ?? DEFAULT_TETTO;
  const base = Math.min(input.imponibile_eur, tetto);
  const detrazione_totale = base * (input.aliquota / 100);
  const rata_annuale = detrazione_totale / 10;
  const capienza_ok = input.reddito_irpef_anno != null
    ? (input.reddito_irpef_anno * 0.23) >= rata_annuale // soglia IRPEF minima
    : null;

  return {
    base_calcolo: base,
    aliquota: input.aliquota,
    detrazione_totale,
    rata_annuale,
    anni_recupero: 10,
    capienza_ok,
  };
}

// ─── Cashflow 10 anni ────────────────────────────────────────────────────────

export interface InputCashflow {
  costo_iniziale: number;          // totale stima IVA inclusa (esborso anno 0)
  risparmio_eur_anno: number;      // risparmio bolletta primo anno
  inflazione_energia_pct?: number; // % annua aumento prezzo energia (default 3%)
  detrazione_eur_anno: number;     // rata annuale Ecobonus (anni 1-10)
  anni_dettaglio?: number;         // anni cashflow da generare (default 10)
}

export interface CashflowRiga {
  anno: number;
  risparmio_bolletta: number;
  detrazione: number;
  flusso_anno: number;             // risparmio + detrazione
  cumulato: number;                // flusso cumulato dall'anno 1
  netto: number;                   // cumulato - costo iniziale (negativo finché in perdita)
}

export interface OutputCashflow {
  righe: CashflowRiga[];
  totale_recuperato_10y: number;
  payback_anni: number | null;     // anno in cui netto >= 0
  pct_recuperato_10y: number;      // % del costo iniziale recuperato in 10 anni
  costo_netto_10y: number;         // costo - totale_recuperato
}

export function calcolaCashflow(input: InputCashflow): OutputCashflow {
  // Guard: tutti gli input numerici NaN-safe
  const costo = Math.max(0, isFinite(input.costo_iniziale) ? input.costo_iniziale : 0);
  const risparmioBase = Math.max(0, isFinite(input.risparmio_eur_anno) ? input.risparmio_eur_anno : 0);
  const detrazione = Math.max(0, isFinite(input.detrazione_eur_anno) ? input.detrazione_eur_anno : 0);
  const inflRaw = input.inflazione_energia_pct ?? 3;
  // Clamp inflazione tra -20% e +50% (oltre è poco realistico)
  const infl = Math.max(-0.2, Math.min(0.5, (isFinite(inflRaw) ? inflRaw : 3) / 100));
  const anni = Math.max(1, Math.floor(input.anni_dettaglio ?? 10));

  const righe: CashflowRiga[] = [];
  let cumulato = 0;
  let payback: number | null = null;

  for (let anno = 1; anno <= anni; anno++) {
    const risparmio_bolletta = risparmioBase * Math.pow(1 + infl, anno - 1);
    const det = anno <= 10 ? detrazione : 0;
    const flusso_anno = risparmio_bolletta + det;
    cumulato += flusso_anno;
    const netto = cumulato - costo;
    if (payback === null && netto >= 0 && flusso_anno > 0) {
      // Calcolo payback più preciso: anno - (eccedenza / flusso_anno)
      payback = anno - netto / flusso_anno;
    }
    righe.push({
      anno,
      risparmio_bolletta: Math.round(risparmio_bolletta * 100) / 100,
      detrazione: Math.round(det * 100) / 100,
      flusso_anno: Math.round(flusso_anno * 100) / 100,
      cumulato: Math.round(cumulato * 100) / 100,
      netto: Math.round(netto * 100) / 100,
    });
  }

  const totale_recuperato_10y = righe[righe.length - 1]?.cumulato ?? 0;
  const pct_recuperato_10y = costo > 0
    ? (totale_recuperato_10y / costo) * 100
    : 0;
  const costo_netto_10y = Math.max(0, costo - totale_recuperato_10y);

  return {
    righe,
    totale_recuperato_10y: Math.round(totale_recuperato_10y * 100) / 100,
    payback_anni: payback != null && isFinite(payback) ? Math.round(payback * 10) / 10 : null,
    pct_recuperato_10y: Math.round(pct_recuperato_10y * 10) / 10,
    costo_netto_10y: Math.round(costo_netto_10y * 100) / 100,
  };
}

// ─── Simulazione rate finanziamento ──────────────────────────────────────────

export interface InputRata {
  importo_finanziato: number;
  durata_mesi: number;
  tasso_annuo_pct: number;         // TAN
}

/**
 * Calcola la rata mensile costante con formula della rata francese.
 * Se tasso = 0 → rata = importo / mesi.
 *
 * Guard: durata > 0 e importo non negativo. Se durata <= 0 ritorna 0.
 */
export function calcolaRata(input: InputRata): number {
  const importo = Math.max(0, isFinite(input.importo_finanziato) ? input.importo_finanziato : 0);
  const durata = Math.max(0, Math.floor(isFinite(input.durata_mesi) ? input.durata_mesi : 0));
  const tasso = Math.max(0, isFinite(input.tasso_annuo_pct) ? input.tasso_annuo_pct : 0);

  if (durata === 0 || importo === 0) return 0;
  if (tasso === 0) {
    return Math.round((importo / durata) * 100) / 100;
  }
  const i = (tasso / 100) / 12;
  const n = durata;
  const rata = importo * i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1);
  if (!isFinite(rata) || rata < 0) return 0;
  return Math.round(rata * 100) / 100;
}

export interface PianoFinanziamentoOpts {
  importo_totale: number;
  anticipo_pct: number;            // 0..100
  piani: Array<{ nome: string; durata_mesi: number; tasso_annuo_pct: number }>;
}

export interface PianoFinanziamentoOutput {
  anticipo: number;
  finanziato: number;
  piani: Array<{
    nome: string;
    mesi: number;
    tasso: number;
    rata_mese: number;
    totale_pagato: number;
  }>;
}

export function calcolaPianoFinanziamento(input: PianoFinanziamentoOpts): PianoFinanziamentoOutput {
  const anticipo = input.importo_totale * (input.anticipo_pct / 100);
  const finanziato = input.importo_totale - anticipo;
  return {
    anticipo: Math.round(anticipo * 100) / 100,
    finanziato: Math.round(finanziato * 100) / 100,
    piani: input.piani.map((p) => {
      const rata = calcolaRata({
        importo_finanziato: finanziato,
        durata_mesi: p.durata_mesi,
        tasso_annuo_pct: p.tasso_annuo_pct,
      });
      return {
        nome: p.nome,
        mesi: p.durata_mesi,
        tasso: p.tasso_annuo_pct,
        rata_mese: rata,
        totale_pagato: Math.round(rata * p.durata_mesi * 100) / 100,
      };
    }),
  };
}
