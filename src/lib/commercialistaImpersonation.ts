/**
 * Helper centralizzato per costruire URL di "impersonation" del commercialista
 * verso l'area aziendale (/azienda/...) con tutti i parametri necessari
 * a far filtrare correttamente la sidebar in CompanyLayout.
 *
 * Pattern: tutti i link dal portale commercialista verso una azienda passano
 * da qui, così aggiungere/rimuovere parametri è un'unica modifica.
 */

export type CommercialistaImpersonationParams = {
  companyId: string;
  companyName: string;
  /** Dove tornare quando il commercialista esce dall'impersonation. Default: /commercialista */
  returnTo?: string;
  /** Pagina di destinazione dentro /azienda. Default: /azienda/controllo-gestione
   * (overview finanziaria del cliente — la landing naturale per lo studio). NON
   * /azienda/cruscotto: quello fa un redirect smart-default che scarta la query
   * string, perdendo commercialistaMode/commercialistaCompany e riportando
   * l'azienda su quella già selezionata. */
  targetUrl?: string;
};

/**
 * Costruisce l'URL completo /azienda/... con i query param commercialistaMode.
 * Il CompanyLayout legge questi param e filtra la sidebar mostrando solo le aree
 * permesse al commercialista (no Marketing & Vendita, no Automazioni & AI).
 */
export function buildCommercialistaCompanyUrl({
  companyId,
  companyName,
  returnTo = "/commercialista/aziende",
  targetUrl = "/azienda/controllo-gestione",
}: CommercialistaImpersonationParams): string {
  const params = new URLSearchParams({
    commercialistaMode: "1",
    commercialistaCompany: companyId,
    commercialistaCompanyName: companyName,
    returnTo,
  });
  const separator = targetUrl.includes("?") ? "&" : "?";
  return `${targetUrl}${separator}${params.toString()}`;
}
