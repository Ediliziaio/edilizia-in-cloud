/** Dove sta la scelta «Come fatturi?» nella pagina Fatturazione, e come ci si porta il focus da altri punti. */

/** Id dei due pulsanti della scelta. */
export const ID_SCELTA_NATIVA = "come-fatturi-nativa";
export const ID_SCELTA_ESTERNA = "come-fatturi-esterna";

/** «Scegli Con Edilizia in Cloud»: scorre fino alla scelta e le dà il focus. */
export function vaiAllaScelta(id: string = ID_SCELTA_NATIVA): void {
  const el = document.getElementById(id);
  el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  el?.focus();
}
