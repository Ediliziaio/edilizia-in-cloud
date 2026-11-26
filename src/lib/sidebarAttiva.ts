/** Le voci che aprono una scheda condividono il percorso, ma non l'evidenziazione. */
export function voceSidebarAttiva(url: string, pathname: string, search: string, altreVoci: readonly string[]): boolean {
  if (url.includes("?")) {
    const [path, query] = url.split("?", 2);
    const richiesti = new URLSearchParams(query);
    const correnti = new URLSearchParams(search);
    return pathname === path && [...richiesti].every(([chiave, valore]) => correnti.get(chiave) === valore);
  }
  if (url === "/azienda/ordini" && pathname === url && new URLSearchParams(search).get("tab") === "programmazione") return false;
  if (url === "/azienda" || url === "/azienda/marketing") return pathname === url;
  if (pathname === url) return true;
  if (!pathname.startsWith(url + "/")) return false;
  return !altreVoci.some(altra => altra !== url && altra.startsWith(url + "/") &&
    (pathname === altra || pathname.startsWith(altra + "/")));
}
