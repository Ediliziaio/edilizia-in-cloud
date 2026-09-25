/**
 * iPhone e iPad ingrandiscono la pagina quando si tocca un campo con il testo
 * sotto i 16px, e non tornano indietro da soli. Per questo i campi da telefono
 * stavano a 16px, più grandi di tutto il resto («troppo grande il font dentro
 * le caselle», 25/09/2026).
 *
 * Con `maximum-scale=1` nel viewport iOS non ingrandisce più al tocco, e in
 * Safari lo zoom con due dita resta, perché iOS ignora il limite per il
 * pizzico. Android non ingrandisce al tocco: lì il viewport resta com'è, zoom
 * compreso. Così i campi stanno a 14px come sul computer.
 */
export function bloccaZoomCampiIos(doc: Document = document, nav: Navigator = navigator): boolean {
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  if (!ios) return false;
  const viewport = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport || /maximum-scale/.test(viewport.content)) return false;
  viewport.content = `${viewport.content}, maximum-scale=1`;
  return true;
}
