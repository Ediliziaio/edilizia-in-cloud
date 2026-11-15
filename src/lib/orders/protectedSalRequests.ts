/** SAL della commessa: il browser legge verbali, voci e sottofasi dalle viste `*_visibili`
 * (security_invoker: stesse righe della tabella), dove gli importi arrivano solo a chi ha
 * «Venduto e importi». Sulle tabelle grezze quelle colonne non sono leggibili (GRANT per colonna):
 * un `select("*")` o un embed `sal_voci(*)` lì fallirebbe per tutti.
 *
 * Si riscrivono le letture (GET/HEAD) e gli embed in ogni `select`, anche nel RETURNING di una
 * scrittura. Le scritture restano sulle tabelle. Il certificato (`sal_certificati`) non ha una vista:
 * lo legge solo chi ha il diritto. Migrazioni 20290402130000 e 20290402130100 (15/11/2026).
 */
const TABELLE = ["sal_records", "sal_voci", "sal_voci_sottofasi"];
// «sal_voci» non deve prendere «sal_voci_sottofasi(»: dopo il nome viene subito «(» o un «!hint».
const EMBED = new RegExp(`(^|[,(])(?:(\\w+):)?(sal_voci_sottofasi|sal_voci|sal_records)((?:![\\w]+)*)\\(`, "g");

export function protectedSalSelect(select: string): string {
  return select.replace(EMBED, (_m, prima: string, alias: string | undefined, tabella: string, hint: string) =>
    `${prima}${alias ?? tabella}:${tabella}_visibili${hint}(`);
}

export function protectedSalUrl(input: string, method = "GET"): string {
  if (!input.includes("/rest/v1/") || input.includes("/rest/v1/rpc/")) return input;
  const url = new URL(input);
  const tabella = url.pathname.split("/rest/v1/")[1];
  if (TABELLE.includes(tabella) && ["GET", "HEAD"].includes(method.toUpperCase())) url.pathname = `/rest/v1/${tabella}_visibili`;
  const select = url.searchParams.get("select");
  if (select) url.searchParams.set("select", protectedSalSelect(select));
  return url.toString();
}
