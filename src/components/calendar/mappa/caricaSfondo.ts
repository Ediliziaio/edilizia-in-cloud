import { stileMappa } from "./servizio";

let moduliVettoriali: ReturnType<typeof importaCartografia> | undefined;
const importaCartografia = () => import("./CartografiaVettoriale");

export function caricaSfondoVettoriale() {
  if (!moduliVettoriali) {
    moduliVettoriali = importaCartografia().catch(errore => {
      moduliVettoriali = undefined;
      throw errore;
    });
  }
  return moduliVettoriali;
}

export function preparaSfondoMappa() {
  if (!stileMappa) return;
  const url = new URL(stileMappa, window.location.href);
  if (url.origin !== window.location.origin && (url.protocol === "https:" || url.protocol === "http:") &&
      !Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]')).some(l => l.href === `${url.origin}/`)) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = url.origin;
    link.crossOrigin = "anonymous";
    document.head.append(link);
  }
  void caricaSfondoVettoriale().catch(() => { /* Il caricamento della mappa può riprovare. */ });
}
