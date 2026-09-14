/**
 * Formula prezzo Serramenti — unica fonte di verità client/server.
 *
 * Schema:
 *   prezzo_acquisto      = listino × (1 − sconto_fornitore)
 *   prezzo_vendita_base  = acquisto × (1 + ricarico_azienda)
 *   prezzo_vendita_magg  = base × (1 + Σmagg%) + Σmaggfix
 *   prezzo_vendita_total = prezzo_vendita_magg + manodopera
 *
 * Arrotondamenti: sempre 2 decimali in uscita. Input tollerato NaN/negativi
 * (clamp a 0 con warning — il chiamante decide se mostrarlo).
 */

import type { PricingInput, PricingOutput } from "../types";

/** Clamp a 2 decimali */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Input sanitization — evita NaN/Infinity di propagarsi */
function safe(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Calcola prezzo vendita completo dalla formula commerciale.
 *
 * @param input PricingInput con listino, sconto, ricarico, maggiorazioni, manodopera
 * @returns PricingOutput con acquisto, vendita no-posa, vendita totale, margine%
 */
export function calcolaPrezzoSerramento(input: PricingInput): PricingOutput {
  const listino = safe(input.prezzo_listino);
  const sconto = Math.max(0, Math.min(1, safe(input.sconto_fornitore)));
  const ricarico = Math.max(0, safe(input.ricarico_azienda));
  const maggPct = Math.max(0, safe(input.maggiorazioni_percentuali));
  const maggFix = Math.max(0, safe(input.maggiorazioni_fisse));
  const manodopera = Math.max(0, safe(input.manodopera));

  // 1. Acquisto = listino scontato dal fornitore
  const prezzo_acquisto = listino * (1 - sconto);

  // 2. Vendita base = acquisto ricaricato dall'azienda
  const vendita_base = prezzo_acquisto * (1 + ricarico);

  // 3. Vendita con maggiorazioni (varianti colore, vetro, telaio, ecc.)
  const vendita_no_posa = vendita_base * (1 + maggPct / 100) + maggFix;

  // 4. Totale cliente includendo manodopera
  const vendita_totale = vendita_no_posa + manodopera;

  // 5. Margine lordo su vendita senza posa (la posa è costo esterno reale)
  const margine =
    vendita_no_posa > 0
      ? ((vendita_no_posa - prezzo_acquisto) / vendita_no_posa) * 100
      : 0;

  return {
    prezzo_acquisto: round2(prezzo_acquisto),
    prezzo_vendita_no_posa: round2(vendita_no_posa),
    prezzo_vendita_totale: round2(vendita_totale),
    margine_percentuale: round2(margine),
  };
}

