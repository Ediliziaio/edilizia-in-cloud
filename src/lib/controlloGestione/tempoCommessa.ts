// ============================================================================
// tempoCommessa — il tempo come dimensione economica della commessa
// ============================================================================
// Il margine di una commessa è un budget di TEMPO: ogni mese di cantiere
// aperto consuma una quota dei costi fissi di struttura. Qui vivono i quattro
// numeri che lo raccontano, in logica pura (zero React, zero Supabase):
//
//   · mesi di apertura        (da inizio lavori a fine lavori o a oggi)
//   · margine al mese         (margine ÷ mesi — confrontalo con la quota)
//   · mesi sostenibili        (per quanti mesi il margine paga la struttura)
//   · costo del ritardo       (mesi oltre la consegna promessa × quota)
//
// Stessa regola di tutta l'area indicatori: MAI numeri inventati. Se manca la
// data di inizio i mesi sono null e la UI mostra cosa compilare; il tasso
// mensile non viene calcolato sotto le due settimane di vita (un cantiere di
// tre giorni "renderebbe" cifre mensili senza senso).
// ============================================================================

const GIORNI_IN_UN_MESE = 30.44; // media civile: 365,25 ÷ 12

/** Mesi (frazionari) tra inizio e fine; se fine manca si usa `oggi`. */
export function mesiApertura(
  inizio: string | null,
  fine: string | null,
  oggi: string,
): number | null {
  if (!inizio) return null;
  const a = Date.parse(inizio);
  const b = Date.parse(fine || oggi);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 86400_000 / GIORNI_IN_UN_MESE;
}

/** Margine mensile della commessa. Null sotto ~2 settimane di vita. */
export function margineAlMese(margine: number, mesi: number | null): number | null {
  if (mesi === null || mesi < 0.5) return null;
  return margine / mesi;
}

/** Per quanti mesi questo margine paga la quota di struttura del cantiere. */
export function mesiSostenibili(
  margine: number,
  quotaStrutturaMensile: number | null,
): number | null {
  if (!quotaStrutturaMensile || quotaStrutturaMensile <= 0 || margine <= 0) return null;
  return margine / quotaStrutturaMensile;
}

/**
 * Mesi di ritardo sulla consegna promessa: per i cantieri aperti conta da
 * `promessa` a oggi, per quelli chiusi da `promessa` alla fine effettiva.
 */
export function mesiRitardo(
  promessa: string | null,
  fineEffettiva: string | null,
  oggi: string,
): number {
  if (!promessa) return 0;
  const p = Date.parse(promessa);
  const f = Date.parse(fineEffettiva || oggi);
  if (!Number.isFinite(p) || !Number.isFinite(f) || f <= p) return 0;
  return (f - p) / 86400_000 / GIORNI_IN_UN_MESE;
}

/** Quanto è costato (finora) il ritardo: mesi oltre la promessa × quota struttura. */
export function costoRitardo(
  mesiDiRitardo: number,
  quotaStrutturaMensile: number | null,
): number | null {
  if (!quotaStrutturaMensile || quotaStrutturaMensile <= 0 || mesiDiRitardo <= 0) return null;
  return mesiDiRitardo * quotaStrutturaMensile;
}

/** Formattazione compatta dei mesi: "0,7" / "3,2". */
export function fmtMesi(mesi: number): string {
  return mesi.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
