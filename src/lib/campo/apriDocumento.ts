/**
 * Apre un documento il cui link si ottiene con una chiamata (link a scadenza su un contenitore riservato).
 *
 * Il telefono blocca le schede che si aprono DOPO un'attesa: `window.open` dentro un `await` non apre niente
 * (su iPhone è la regola). Qui la scheda si apre PRIMA, vuota e dentro il tocco, e ci si mette il link quando
 * arriva; se il link non arriva la scheda si chiude e si dice com'è andata.
 */
export async function apriDocumentoDopoAttesa(ottieniLink: () => Promise<string | null | undefined>): Promise<boolean> {
  const scheda = window.open("", "_blank");
  if (scheda) scheda.opener = null;
  try {
    const url = await ottieniLink();
    if (!url) throw new Error("link non disponibile");
    if (scheda && !scheda.closed) scheda.location.replace(url);
    else window.location.assign(url);
    return true;
  } catch {
    scheda?.close();
    return false;
  }
}
