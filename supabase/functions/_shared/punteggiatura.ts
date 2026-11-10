/**
 * Il punto in fondo a una frase che finisce con un dato scritto da qualcuno (10/11/2026).
 *
 * Nel contratto di subappalto di Impresa Vulcano usciva «Titolare per l'Affidataria: Impresa Vulcano s.r.l..»: la
 * ragione sociale finisce già col punto, e il testo ne aggiungeva un altro. Qui la regola in un posto solo: il punto
 * si aggiunge solo se il testo non finisce già con un segno che chiude la frase.
 *
 * Modulo puro: lo importano frontend, edge e bundle.
 */

/** Il testo con un punto in fondo, se non finisce già con «.», «!», «?» o «…». Vuoto resta vuoto. */
export function conPunto(testo: string | null | undefined): string {
  const t = String(testo ?? "").replace(/\s+$/, "");
  if (!t) return "";
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/**
 * Un valore messo davanti a un testo che comincia col punto: se il valore finisce già col punto, uno solo.
 * Per le sostituzioni dei segnaposto («{{azienda.ragione_sociale}}.» con «… s.r.l.»).
 */
export function senzaPuntoDoppio(valore: string, seguito: string): string {
  return seguito.startsWith(".") && /\.$/.test(valore) && !/\.\.$/.test(valore) ? valore.slice(0, -1) : valore;
}
