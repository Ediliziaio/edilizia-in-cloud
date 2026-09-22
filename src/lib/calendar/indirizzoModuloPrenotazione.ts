/**
 * I parametri della pagina che il modulo di prenotazione sa leggere: il link
 * personale dei messaggi automatici (?c=<id contatto>) e i campi precompilati.
 * Solo questi passano dentro l'iframe: niente parametri di tracciamento o altro.
 */
const PARAMETRI_DEL_MODULO = ["c", "name", "first_name", "last_name", "email", "phone"];

export function indirizzoModuloPrenotazione(slug: string, cercaPagina: string): string {
  const pagina = new URLSearchParams(cercaPagina);
  const modulo = new URLSearchParams({ embed: "1" });
  for (const chiave of PARAMETRI_DEL_MODULO) {
    const valore = pagina.get(chiave);
    if (valore) modulo.set(chiave, valore);
  }
  return `/prenota/${slug}?${modulo.toString()}`;
}
