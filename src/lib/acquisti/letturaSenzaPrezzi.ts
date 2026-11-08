/**
 * Chi non ha il permesso di vedere i costi legge ordini e offerte senza prezzi.
 * In Postgres una colonna non si nasconde utente per utente: si legge da una vista con le
 * stesse colonne e i prezzi vuoti. Il cambio sta qui, in un punto solo, così nessuna delle
 * letture sparse nell'app può sfuggire; le scritture e le funzioni non passano da qui.
 */
const TABELLE = ["purchase_order_items", "purchase_orders", "supplier_rfq_quotes", "supplier_rfq_suppliers", "order_items"];
const SUFFISSO = "_senza_prezzi";
const CHIAVE_PROVA = "eic-prova-senza-prezzi";

let attiva = false;

/** Solo in sviluppo: per vedere l'app come chi non vede i costi. */
function provaInSviluppo(): boolean {
  if (!import.meta.env.DEV) return false;
  try { return localStorage.getItem(CHIAVE_PROVA) === "1"; } catch { return false; }
}

export function impostaLetturaSenzaPrezzi(valore: boolean): void {
  attiva = valore;
}

export function letturaSenzaPrezzi(): boolean {
  return attiva || provaInSviluppo();
}

const EMBED = new RegExp(`(^|[,(])(?:(\\w+):)?(${TABELLE.join("|")})((?:![\\w]+)*)\\(`, "g");

/** Riscrive una select: l'alias resta il nome di prima, così chi legge il risultato non cambia. */
export function selectSenzaPrezzi(select: string): string {
  return select.replace(EMBED, (_t, prima: string, alias: string | undefined, tabella: string, suggerimenti: string) =>
    `${prima}${alias ?? tabella}:${tabella}${SUFFISSO}${suggerimenti}(`);
}

/** L'indirizzo da usare per una lettura; le scritture e le RPC restano come sono. */
export function urlSenzaPrezzi(indirizzo: string, metodo: string | undefined): string {
  if ((metodo ?? "GET").toUpperCase() !== "GET" && (metodo ?? "GET").toUpperCase() !== "HEAD") return indirizzo;
  if (!indirizzo.includes("/rest/v1/") || indirizzo.includes("/rest/v1/rpc/")) return indirizzo;
  const url = new URL(indirizzo);
  const percorso = url.pathname.split("/rest/v1/")[1];
  if (TABELLE.includes(percorso)) url.pathname = `/rest/v1/${percorso}${SUFFISSO}`;
  const select = url.searchParams.get("select");
  if (select) url.searchParams.set("select", selectSenzaPrezzi(select));
  return url.toString();
}
