/**
 * Il link di un avviso per chi lavora nell'area campo (operai e subappaltatori).
 *
 * Gli avvisi nascono con link dell'area ufficio (/azienda/attivita,
 * /azienda/ordini/<id>…), che a questi ruoli è chiusa: aprendoli si finiva
 * rimandati alla home. Stessa traduzione della funzione del database
 * link_notifica_per_utente (migrazione 20280926140000), che la applica alle push.
 */
export function linkPerCampo(url: string | null | undefined): string {
  if (!url) return "/campo";
  if (url.startsWith("/campo")) return url;
  const commessa = url.match(/^\/azienda\/ordini\/([0-9a-f-]{36})/);
  if (commessa) return `/campo/lavoro/${commessa[1]}`;
  if (url.startsWith("/azienda/attivita")) return "/campo/attivita";
  if (url.startsWith("/azienda/personale")) return "/campo/documenti";
  return "/campo";
}
