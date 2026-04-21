/**
 * priceMarkup — utility pura per calcolare il prezzo di vendita a partire
 * dal prezzo di acquisto applicando il markup configurato sulla famiglia.
 *
 * Usato quando `article_families.prezzo_base_mode === "acquisto_markup"`:
 * l'utente carica solo il prezzo di acquisto + markup; il prezzo di vendita
 * viene derivato automaticamente lato client e persistito come "cache" nel
 * campo `prezzo_base_vendita`, così la pricing pipeline esistente
 * (FamilyPricePreview, quote builder, ecc.) continua a funzionare senza
 * modifiche.
 *
 * Quando `prezzo_base_mode === "vendita"` questa utility NON viene chiamata:
 * il campo vendita è input diretto dell'utente.
 */

import type { MarkupTipo } from "@/types/articleFamily";

export interface MarkupInput {
  /** Prezzo di acquisto dal fornitore (€). */
  prezzoAcquisto: number;
  /** Strategia di markup scelta per la famiglia. */
  markupTipo: MarkupTipo;
  /**
   * Valore del markup:
   *  - percentuale (es. 45 = +45%)
   *  - euro fissi al pezzo (es. 120 = +120€/pz)
   *  - ignorato se markupTipo === "none"
   */
  markupValore: number;
}

export interface MarkupResult {
  /** Prezzo di vendita calcolato (sempre >= 0, mai negativo). */
  prezzoVendita: number;
  /** Margine in euro (vendita - acquisto). Puo' essere 0 se markupTipo="none". */
  margineEuro: number;
  /**
   * Margine in percentuale sul prezzo di vendita (non di costo).
   * null se prezzoVendita <= 0 (divisione per zero).
   * Formula: (vendita - acquisto) / vendita * 100
   */
  marginePercentualeSuVendita: number | null;
}

/**
 * Calcola il prezzo di vendita da (acquisto + markup). Pure function:
 * no I/O, no side effects, deterministica.
 *
 * Contratto:
 *  - Input negativi vengono normalizzati a 0 (defensive: il DB ha DEFAULT 0
 *    ma il form potrebbe passare valori invalidi in fase di digitazione).
 *  - Output prezzoVendita è sempre >= prezzoAcquisto per markupTipo diverso
 *    da "none" (il markup non può ridurre il prezzo — è un ricarico).
 *  - NaN / Infinity vengono normalizzati a 0.
 */
export function applyMarkup(input: MarkupInput): MarkupResult {
  const acquisto = sanitize(input.prezzoAcquisto);
  const valore = sanitize(input.markupValore);

  let vendita: number;
  switch (input.markupTipo) {
    case "percentuale":
      // Un markup percentuale negativo non ha senso business. Lo clamp
      // a 0 evita di trasformare un acquisto in un ricavo minore.
      vendita = acquisto * (1 + Math.max(0, valore) / 100);
      break;
    case "fisso_pz":
      vendita = acquisto + Math.max(0, valore);
      break;
    case "none":
    default:
      vendita = acquisto;
      break;
  }

  // Floor a 0 in ogni caso (anche se acquisto fosse negativo pre-sanitize).
  vendita = Math.max(0, vendita);

  const margineEuro = vendita - acquisto;
  const marginePercentualeSuVendita =
    vendita > 0 ? (margineEuro / vendita) * 100 : null;

  return { prezzoVendita: vendita, margineEuro, marginePercentualeSuVendita };
}

/**
 * Restituisce il prezzo di vendita "effettivo" per una famiglia, considerando
 * la sua strategia di prezzo (vendita diretta vs acquisto+markup).
 *
 * Evita di duplicare il branching in ogni caller (FamilyEditor, pricing
 * pipeline, preview, ecc).
 */
export function resolvePrezzoVendita(args: {
  prezzoBaseMode: "vendita" | "acquisto_markup";
  prezzoVenditaInput: number;
  prezzoAcquistoInput: number;
  markupTipo: MarkupTipo;
  markupValore: number;
}): number {
  if (args.prezzoBaseMode === "vendita") {
    return Math.max(0, sanitize(args.prezzoVenditaInput));
  }
  return applyMarkup({
    prezzoAcquisto: args.prezzoAcquistoInput,
    markupTipo: args.markupTipo,
    markupValore: args.markupValore,
  }).prezzoVendita;
}

function sanitize(n: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return n;
}
