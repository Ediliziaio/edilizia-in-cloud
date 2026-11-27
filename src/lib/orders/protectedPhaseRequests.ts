/** Fasi e voci della commessa: il browser le legge dalle viste `*_visibili`,
 * che hanno le stesse righe della tabella (security_invoker) ma danno l'importo
 * venduto, l'importo e i costi delle voci solo a chi ha il permesso.
 * Sulle tabelle grezze quelle colonne non sono leggibili (GRANT per colonna):
 * un `select("*")` o un embed `order_work_phases(*)` lì fallirebbe per tutti.
 *
 * Si riscrivono le letture (GET/HEAD) e gli embed in ogni `select`, anche nel
 * RETURNING di una scrittura. Le scritture restano sulle tabelle, con le loro
 * regole e i loro trigger. Migrazioni 20290327110000 e 20290327110100.
 *
 * Stesso impianto per le righe di rendiconto (`appalto_rendiconto_righe`,
 * migrazione 20290629190000): la riga la legge chi ha solo «Venduto e importi»,
 * e `costo_interno` e `margine` arrivano solo a chi ha «Costi» su quella
 * commessa. Senza la vista il costo non si poteva più scrivere, e il margine
 * della commessa non si vedeva nemmeno a chi aveva il permesso (27/11/2026).
 */
const TABELLE = ["order_work_phases", "order_work_phase_voci", "appalto_rendiconto_righe"];
const EMBED = new RegExp(`((?:^|[,(])\\s*)(?:(\\w+):)?(${TABELLE.join("|")})((?:![\\w]+)*)\\(`, "g");

export function protectedPhaseSelect(select: string): string {
  return select.replace(EMBED, (_m, prima: string, alias: string | undefined, tabella: string, hint: string) =>
    `${prima}${alias ?? tabella}:${tabella}_visibili${hint}(`);
}

export function protectedPhaseUrl(input: string, method = "GET"): string {
  if (!input.includes("/rest/v1/") || input.includes("/rest/v1/rpc/")) return input;
  const url = new URL(input);
  const tabella = url.pathname.split("/rest/v1/")[1];
  if (TABELLE.includes(tabella) && ["GET", "HEAD"].includes(method.toUpperCase())) url.pathname = `/rest/v1/${tabella}_visibili`;
  const select = url.searchParams.get("select");
  if (select) url.searchParams.set("select", protectedPhaseSelect(select));
  return url.toString();
}
