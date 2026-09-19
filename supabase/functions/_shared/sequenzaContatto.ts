/**
 * Sequenze email + WhatsApp a mano (19/09/2026, flusso «Download Risorse —
 * PDF Vendita»): i pezzi puri che servono al motore delle automazioni.
 *
 * - numeroWhatsApp: il telefono del contatto come lo vuole wa.me (solo cifre,
 *   col prefisso internazionale), per il link che apre la chat dal telefono;
 * - conLinkCliccabili: nelle notifiche interne gli indirizzi erano testo
 *   morto, e dal telefono non si potevano toccare;
 * - senzaSpazioPrimaDellaVirgola: «Ciao {{nome}},» con il nome vuoto diventava
 *   «Ciao ,»;
 * - schedaAndataAvanti: la regola di «Interrompi su risposta» per chi non
 *   risponde per email — se la scheda del contatto entra in una fase dopo la
 *   prima mentre la sequenza gira, qualcuno se ne sta occupando a mano
 *   (ha scritto su WhatsApp, ha prenotato) e la sequenza si ferma.
 *
 * Provato in src/test/logic/sequenzaContatto.test.ts.
 */

/** «+39 333 123 4567» → «393331234567»; un cellulare senza prefisso prende il 39. */
export function numeroWhatsApp(telefono: string | null | undefined): string {
  let cifre = String(telefono ?? "").replace(/\D/g, "");
  if (cifre.startsWith("00")) cifre = cifre.slice(2);
  if (cifre.length === 10 && cifre.startsWith("3")) cifre = `39${cifre}`;
  return cifre.length >= 8 ? cifre : "";
}

/**
 * Gli indirizzi web di una riga GIÀ ripulita per l'HTML diventano link. La
 * punteggiatura in coda («…/gruppo.») resta fuori dal link.
 */
export function conLinkCliccabili(rigaHtml: string): string {
  return rigaHtml.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const coda = url.match(/[.,;:!?)\]]+$/)?.[0] ?? "";
    const pulito = coda ? url.slice(0, -coda.length) : url;
    return `<a href="${pulito}" style="color:#1d4ed8">${pulito}</a>${coda}`;
  });
}

/** Lo spazio prima della virgola non è mai giusto: resta quando una variabile è vuota. */
export function senzaSpazioPrimaDellaVirgola(testo: string): string {
  return testo.replace(/ +,/g, ",");
}

/**
 * Durante la sequenza la scheda del contatto è entrata in una fase dopo la
 * prima della sua pipeline? La creazione non conta (entra nella prima fase),
 * uno spostamento a mano sì — anche verso «Perso» o «Non qualificato».
 */
export function schedaAndataAvanti(
  ingressi: Array<{ stage_id: string; entered_at: string | null }>,
  posizioni: Map<string, number | null>,
  inizioSequenza: string,
): boolean {
  const da = Date.parse(inizioSequenza);
  if (!Number.isFinite(da)) return false;
  return ingressi.some((i) => {
    const quando = i.entered_at ? Date.parse(i.entered_at) : NaN;
    if (!Number.isFinite(quando) || quando <= da) return false;
    const posizione = posizioni.get(i.stage_id);
    return typeof posizione === "number" && posizione > 0;
  });
}
