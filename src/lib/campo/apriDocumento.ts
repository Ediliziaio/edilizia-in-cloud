import { Capacitor } from "@capacitor/core";
import { apriDocumentoNativo } from "@/lib/mobile/documenti";

/**
 * Apre un documento il cui link si ottiene con una chiamata (link a scadenza su un contenitore riservato).
 *
 * Il telefono blocca le schede che si aprono DOPO un'attesa: `window.open` dentro un `await` non apre niente
 * (su iPhone è la regola). Qui la scheda si apre PRIMA, vuota e dentro il tocco, e ci si mette il link quando
 * arriva; se il link non arriva la scheda si chiude e si dice com'è andata.
 */
export async function apriDocumentoDopoAttesa(ottieniLink: () => Promise<string | null | undefined>, nome?: string): Promise<boolean> {
  try { await apriDocumentoDaRichiesta(ottieniLink, nome); return true; }
  catch { return false; }
}

/** Variante che conserva l'errore del servizio per chi mostra già il proprio messaggio. */
export async function apriDocumentoDaRichiesta(
  ottieniLink: () => Promise<string | null | undefined>,
  nome?: string,
  opzioni: { richiediScheda?: boolean } = {},
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const url = await ottieniLink();
    if (!url) throw new Error("Documento non disponibile. Riprova.");
    await apriDocumentoNativo(url, nome);
    return;
  }
  const scheda = window.open("", "_blank");
  if (scheda) scheda.opener = null;
  if (!scheda && opzioni.richiediScheda) throw new Error("Consenti i popup per aprire il documento.");
  try {
    const url = await ottieniLink();
    if (!url) throw new Error("link non disponibile");
    if (!["http:", "https:", "blob:"].includes(new URL(url).protocol)) throw new Error("Indirizzo del documento non valido.");
    if (scheda && !scheda.closed) scheda.location.replace(url);
    else window.location.assign(url);
  } catch (errore) {
    scheda?.close();
    throw errore;
  }
}
