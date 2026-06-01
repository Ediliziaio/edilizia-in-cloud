/**
 * Adeguamento prezzi in blocco — logica pura, zero dipendenze da React/Supabase.
 *
 * Permette di applicare un adeguamento (percentuale o importo fisso) al prezzo
 * di vendita e/o al costo interno di un insieme di tariffe, con arrotondamento
 * configurabile. Estratta come modulo puro così è testabile e riusabile.
 */

export type AdjustTarget = "vendita" | "costo" | "entrambi";
export type AdjustMode = "percent" | "fixed";
/** Arrotondamento del risultato: nessuno (2 decimali), a 0,50 o all'intero. */
export type RoundMode = "none" | "0.50" | "1";

export interface PriceAdjustOptions {
  target: AdjustTarget;
  mode: AdjustMode;
  /**
   * Importo con segno: in `percent` è la percentuale (es. 5 = +5%, -3 = −3%),
   * in `fixed` è l'importo in € (es. 2.5 = +2,50 €, -1 = −1,00 €).
   */
  amount: number;
  round: RoundMode;
}

/** Arrotonda secondo {@link RoundMode}, comunque a max 2 decimali. */
export function roundPrice(n: number, round: RoundMode): number {
  if (!Number.isFinite(n)) return 0;
  switch (round) {
    case "1":
      return Math.round(n);
    case "0.50":
      return Math.round(n * 2) / 2;
    case "none":
    default:
      return Math.round(n * 100) / 100;
  }
}

/**
 * Adegua un singolo valore. `null`/`undefined`/non-finito → `null` (lasciato
 * invariato dal chiamante). Il risultato è sempre ≥ 0 (clamp) e arrotondato.
 */
export function adjustValue(
  value: number | null | undefined,
  opts: Pick<PriceAdjustOptions, "mode" | "amount" | "round">,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const raw =
    opts.mode === "percent"
      ? value * (1 + opts.amount / 100)
      : value + opts.amount;
  const clamped = Math.max(0, raw);
  return roundPrice(clamped, opts.round);
}

export interface TariffaPriceInput {
  prezzo_vendita?: number | null;
  costo_interno?: number | null;
  prezzo_costo?: number | null;
}

export interface TariffaPriceResult {
  /** Nuovo prezzo di vendita (o quello originale se non toccato / non valorizzato). */
  prezzo_vendita: number | null;
  /** Nuovo costo interno (idem). */
  costo_interno: number | null;
  changedVendita: boolean;
  changedCosto: boolean;
}

/** Sorgente costo: preferisci `costo_interno`, poi il legacy `prezzo_costo`. */
function sourceCosto(t: TariffaPriceInput): number | null {
  if (t.costo_interno != null && Number.isFinite(t.costo_interno)) return t.costo_interno;
  if (t.prezzo_costo != null && Number.isFinite(t.prezzo_costo)) return t.prezzo_costo;
  return null;
}

/**
 * Calcola i nuovi prezzi per una tariffa secondo le opzioni. Non muta l'input.
 * I flag `changed*` indicano se il valore è effettivamente cambiato (utile per
 * costruire un update minimale e contare le voci impattate).
 */
export function computeAdjustedPrices(
  t: TariffaPriceInput,
  opts: PriceAdjustOptions,
): TariffaPriceResult {
  const origVendita = t.prezzo_vendita != null && Number.isFinite(t.prezzo_vendita) ? t.prezzo_vendita : null;
  const origCosto = sourceCosto(t);

  const touchVendita = opts.target === "vendita" || opts.target === "entrambi";
  const touchCosto = opts.target === "costo" || opts.target === "entrambi";

  const newVendita = touchVendita ? adjustValue(origVendita, opts) : origVendita;
  const newCosto = touchCosto ? adjustValue(origCosto, opts) : origCosto;

  return {
    prezzo_vendita: newVendita,
    costo_interno: newCosto,
    changedVendita: touchVendita && newVendita != null && newVendita !== origVendita,
    changedCosto: touchCosto && newCosto != null && newCosto !== origCosto,
  };
}

/** Margine % sul prezzo di vendita (coerente con `calcMargine` della pagina). */
export function marginePerc(prezzoVendita: number | null, costo: number | null): number | null {
  if (prezzoVendita == null || prezzoVendita <= 0) return null;
  if (costo == null) return null;
  return ((prezzoVendita - costo) / prezzoVendita) * 100;
}
