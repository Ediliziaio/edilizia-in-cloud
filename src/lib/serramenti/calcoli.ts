/**
 * src/lib/serramenti/calcoli.ts — calcoli economici base
 *
 * - Totale BOM (serramenti + accessori + servizi)
 * - Applicazione sconti (fisso + percentuale)
 * - Forbice min/max (per gestire varianti di mercato)
 * - IVA standard (0/4/10/22) + IVA Mista (Beni Significativi DM 29.12.99)
 */
import type { SrSerramentoRow, SrAccessorioRow, SrServizioRow } from "@/types/serramenti";

/** Breakdown IVA mista per regola Beni Significativi (DM 29.12.99). */
export interface MistaBreakdown {
  /** Imponibile totale al 10% (parte agevolata + sempre 10%). */
  imponibile_10: number;
  /** Imponibile totale al 22% (parte BS eccedente + prestazioni professionali). */
  imponibile_22: number;
  /** IVA 10%. */
  iva_10: number;
  /** IVA 22%. */
  iva_22: number;
  /** Quota di Beni Significativi al 10% (limite agevolazione). */
  bs_quota_10: number;
  /** Quota di Beni Significativi al 22% (eccedenza). */
  bs_quota_22: number;
  /** Somma "altre prestazioni" (accessori + servizi) — base del limite agevolazione. */
  altre_prestazioni: number;
}

export interface CalcoloTotale {
  /** Serramenti: prezzo già include la posa configurata nel listino prodotto */
  imponibile_serramenti: number;
  imponibile_accessori: number;
  /** Servizi aggiuntivi (trasporto, ENEA, smaltimento, ecc.) */
  imponibile_servizi: number;
  imponibile_lordo: number;       // somma totale
  sconto: number;                  // valore sconto applicato
  imponibile_netto: number;        // dopo sconto
  /** Aliquota IVA effettivamente applicata. -1 = mista (vedi mista_breakdown). */
  iva_pct_applicata: number;
  /** True se la modalita' selezionata e' "mista" (Beni Significativi). */
  iva_mista: boolean;
  /** Breakdown calcolato secondo DM 29.12.99 (presente solo se iva_mista=true). */
  mista_breakdown: MistaBreakdown | null;
  iva_importo: number;
  totale_iva_inclusa: number;
  metri_quadri: number;
  num_serramenti: number;
  num_accessori: number;
  num_servizi: number;
}

export interface CalcoloOptions {
  /**
   * Aliquota IVA: 0, 4, 10, 22, oppure -1 per "mista" (sentinel).
   * Default: 10% (ristrutturazione edilizia, caso piu' comune serramenti).
   */
  iva_percentuale?: number;
  sconto_percentuale?: number;     // 0..100
  sconto_importo?: number;         // sconto fisso in € (alternativa al %)
  /**
   * Solo per IVA mista: imponibile "Prestazioni professionali" (sempre 22%).
   * Da specificare se nel preventivo ci sono consulenze tecniche, perizie,
   * progettazione che NON rientrano nei beni/posa/opere accessorie.
   * Default 0 (non ci sono prestazioni professionali separate).
   */
  prestazioni_professionali?: number;
}

/** Sentinel: IVA mista (Beni Significativi DM 29.12.99). Vedi StepEconomia. */
export const IVA_MISTA_SENTINEL = -1;

/**
 * Calcola lo split IVA mista secondo l'art. 7 c.1 L. 488/99 + DM 29.12.99
 * (Beni Significativi). I serramenti sono "Beni Significativi" per legge:
 * godono dell'IVA agevolata 10% SOLO fino al valore delle altre prestazioni
 * (posa + altre opere + accessori). L'eventuale eccedenza è al 22%.
 *
 * Esempio numerico (Excel allegato):
 *   serramenti=1690, accessori=1270, posa+opere=1550, prestazioni_prof=150
 *   altre_prestazioni = 1270 + 1550 = 2820
 *   serramenti (1690) ≤ altre_prestazioni (2820) → tutto BS al 10%
 *   imponibile_10 = 1690 + 2820 = 4510 · imponibile_22 = 150
 *
 * Tutti gli input sono già al netto dello sconto: lo sconto deve essere
 * applicato proporzionalmente PRIMA di chiamare questa funzione.
 */
export function calcolaIvaMista(
  imponibileBeniSignificativi: number,
  imponibileAccessori: number,
  imponibileServizi: number,
  prestazioniProfessionali: number = 0,
): MistaBreakdown {
  const F2 = Math.max(0, imponibileBeniSignificativi);   // Serramenti (BS)
  const F4 = Math.max(0, imponibileAccessori);           // Altri beni accessori
  const F56 = Math.max(0, imponibileServizi);            // Posa + altre opere
  const F7 = Math.max(0, prestazioniProfessionali);      // Prestazioni professionali (sempre 22%)

  const altre_prestazioni = F4 + F56;

  // Regola DM 29.12.99: BS gode di 10% solo fino a "altre_prestazioni"
  let bs_quota_10: number;
  let bs_quota_22: number;
  if (F2 <= altre_prestazioni) {
    // Tutti i BS rientrano nel limite → tutto al 10%
    bs_quota_10 = F2;
    bs_quota_22 = 0;
  } else {
    // BS eccedono → quota agevolata + eccedenza al 22%
    bs_quota_10 = altre_prestazioni;
    bs_quota_22 = F2 - altre_prestazioni;
  }

  // Altre prestazioni: sempre al 10%. Prestazioni professionali: sempre al 22%.
  const imponibile_10 = bs_quota_10 + altre_prestazioni;
  const imponibile_22 = bs_quota_22 + F7;
  const iva_10 = imponibile_10 * 0.10;
  const iva_22 = imponibile_22 * 0.22;

  return {
    imponibile_10,
    imponibile_22,
    iva_10,
    iva_22,
    bs_quota_10,
    bs_quota_22,
    altre_prestazioni,
  };
}

export function calcolaTotale(
  serramenti: SrSerramentoRow[],
  accessori: SrAccessorioRow[],
  opts: CalcoloOptions = {},
  servizi: SrServizioRow[] = [],
): CalcoloTotale {
  const ivaRaw = opts.iva_percentuale ?? 10;
  const isMista = ivaRaw === IVA_MISTA_SENTINEL;
  const scontoPct = opts.sconto_percentuale ?? 0;
  const scontoEur = opts.sconto_importo ?? 0;
  const prestazioni_professionali = Math.max(0, opts.prestazioni_professionali ?? 0);

  // Serramenti: prezzo già comprende eventuale posa configurata sul prodotto
  const imponibile_serramenti = serramenti.reduce(
    (acc, s) => acc + Number(s.prezzo_totale ?? (s.prezzo_unitario ?? 0) * (s.quantita ?? 1)),
    0,
  );
  const imponibile_accessori = accessori.reduce(
    (acc, a) => acc + Number(a.prezzo_totale ?? (a.prezzo_unitario ?? 0) * (a.quantita ?? 1)),
    0,
  );
  // Servizi aggiuntivi (trasporto, ENEA, smaltimento, posa esterna…)
  const imponibile_servizi = servizi.reduce(
    (acc, s) => acc + Number(s.prezzo_totale_vendita ?? (s.prezzo_unitario_vendita ?? 0) * (s.quantita ?? 1)),
    0,
  );
  const imponibile_lordo = imponibile_serramenti + imponibile_accessori + imponibile_servizi;

  // Sconto: prima il fisso, poi il %
  const dopoFisso = Math.max(0, imponibile_lordo - scontoEur);
  const scontoPctEur = dopoFisso * (scontoPct / 100);
  const imponibile_netto = dopoFisso - scontoPctEur;
  const sconto = imponibile_lordo - imponibile_netto;

  // ─── Calcolo IVA ──────────────────────────────────────────────────────────
  let iva_pct_applicata: number;
  let iva_importo: number;
  let mista_breakdown: MistaBreakdown | null = null;

  if (isMista) {
    // Distribuisci lo sconto proporzionalmente su ogni categoria (serramenti,
    // accessori, servizi) cosi' la regola BS opera su importi gia' scontati.
    // Senza ripartizione, applicare lo sconto solo dopo lo split distorcerebbe
    // il limite del bene significativo.
    const ratio = imponibile_lordo > 0 ? imponibile_netto / imponibile_lordo : 1;
    const bsScontato = imponibile_serramenti * ratio;
    const accScontati = imponibile_accessori * ratio;
    const servScontati = imponibile_servizi * ratio;
    mista_breakdown = calcolaIvaMista(bsScontato, accScontati, servScontati, prestazioni_professionali);
    iva_importo = mista_breakdown.iva_10 + mista_breakdown.iva_22;
    // Aliquota "effettiva" media (informativa): IVA / imponibile.
    iva_pct_applicata = imponibile_netto > 0
      ? Math.round((iva_importo / imponibile_netto) * 10000) / 100
      : 10;
  } else {
    iva_pct_applicata = ivaRaw;
    iva_importo = imponibile_netto * (ivaRaw / 100);
  }

  const totale_iva_inclusa = imponibile_netto + iva_importo;

  const metri_quadri = serramenti.reduce((acc, s) => {
    const mq = s.metri_quadri ??
      ((s.larghezza_mm ?? 0) * (s.altezza_mm ?? 0) * (s.quantita ?? 1)) / 1_000_000;
    return acc + Number(mq);
  }, 0);

  const num_serramenti = serramenti.reduce((acc, s) => acc + (s.quantita ?? 1), 0);
  const num_accessori = accessori.reduce((acc, a) => acc + (a.quantita ?? 1), 0);
  const num_servizi = servizi.reduce((acc, s) => acc + (s.quantita ?? 1), 0);

  return {
    imponibile_serramenti,
    imponibile_accessori,
    imponibile_servizi,
    imponibile_lordo,
    sconto,
    imponibile_netto,
    iva_pct_applicata,
    iva_mista: isMista,
    mista_breakdown,
    iva_importo,
    totale_iva_inclusa,
    metri_quadri,
    num_serramenti,
    num_accessori,
    num_servizi,
  };
}

/**
 * Calcolo m² da dimensioni serramento.
 * Guard: input non negativi/NaN, ritorna 0 se invalid.
 */
export function calcolaM2(larghezza_mm: number, altezza_mm: number, quantita: number = 1): number {
  const l = Math.max(0, isFinite(larghezza_mm) ? larghezza_mm : 0);
  const h = Math.max(0, isFinite(altezza_mm) ? altezza_mm : 0);
  const q = Math.max(0, Math.floor(isFinite(quantita) ? quantita : 0));
  return (l * h * q) / 1_000_000;
}
