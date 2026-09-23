/**
 * La città di una landing /software-gestionale-edilizia-<città>, con o senza
 * barra finale.
 *
 * L'indirizzo canonico ha la barra finale (sitemap, canonical, Google). Fino
 * al 23/09/2026 da "/software-gestionale-edilizia-milano/" usciva "milano/":
 * la città non si trovava e la pagina rimandava alla home, così chi arrivava
 * da Google vedeva Milano per un attimo e poi la home.
 */
export function cittaDaPercorso(pathname: string): string | undefined {
  return pathname.match(/^\/software-gestionale-edilizia-([^/]+)\/?$/)?.[1];
}
