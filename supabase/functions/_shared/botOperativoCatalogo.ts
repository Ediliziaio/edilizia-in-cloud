/**
 * Quali strumenti ha il bot operativo per chi scrive (27/09/2026).
 *
 * Ufficio e amministratore ricevono anche gli strumenti di Silvio (stesso
 * registro della chat dell'app). Dove i due fanno la stessa cosa:
 *  - per i file appena arrivati vince il bot (sa usare la foto o il vocale
 *    di questo messaggio, Silvio li cerca nel suo archivio di caricamenti);
 *  - per le letture vince Silvio (le vecchie del bot hanno difetti noti:
 *    stato_cantiere dà margine 100% perché i materiali valgono sempre 0).
 */

import type { TipoUtenteBot } from "./botOperativoRuoli.ts";

/** Strumenti di Silvio che sul bot non servono: c'è quello del bot. */
export const SILVIO_DOPPIONI_DEL_BOT = new Set([
  // registra_rapportino is an office action for a named employee, not the
  // worker's own draft. Keep both tools with their respective permissions.
  "carica_ddt", // → carica_ddt del bot (legge la foto del messaggio)
  "analyze_image", // la foto si legge già all'arrivo
  "carica_documento_cantiere", // cerca il file tra i caricamenti della chat dell'app
]);

/** Strumenti del bot che lasciano il posto a quelli di Silvio. */
export const BOT_SUPERATI_DA_SILVIO = new Set([
  "stato_cantiere",
  "marginalita_cantiere",
  "scadenze_fatture",
  "costi_mese",
  "scostamenti_commesse",
  "lista_approvazioni",
  "approva_richiesta",
]);

export function usaStrumentiSilvio(tipo: TipoUtenteBot): boolean {
  return tipo === "ufficio" || tipo === "admin";
}

export function unisciCatalogo(nomiBot: string[], nomiSilvio: string[]): { bot: string[]; silvio: string[] } {
  const bot = nomiBot.filter((n) => !BOT_SUPERATI_DA_SILVIO.has(n));
  const presi = new Set(bot);
  const silvio = nomiSilvio.filter((n) => !SILVIO_DOPPIONI_DEL_BOT.has(n) && !presi.has(n));
  return { bot, silvio };
}
