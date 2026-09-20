/**
 * Le regole di testo del documento, senza il motore PDF.
 *
 * Stanno fuori da `DocumentoEdilePDF` perché le usa anche l'anteprima di copertina
 * dell'editor: importarle da lì si porterebbe dietro tutto @react-pdf (740 kB)
 * nella pagina dell'editor, che oggi lo carica solo quando si genera il PDF.
 */

/**
 * «Il *progetto* per la tua casa.» → tre pezzi, quello fra asterischi va in
 * corsivo. Senza asterischi il titolo resta intero: i titoli scritti dalle
 * aziende prima di questa regola escono com'erano.
 */
export function spezzaAccento(titolo: string): Array<{ testo: string; accento: boolean }> {
  const pezzi: Array<{ testo: string; accento: boolean }> = [];
  const re = /\*([^*]+)\*/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(titolo)) !== null) {
    if (m.index > ultimo) pezzi.push({ testo: titolo.slice(ultimo, m.index), accento: false });
    pezzi.push({ testo: m[1], accento: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < titolo.length) pezzi.push({ testo: titolo.slice(ultimo), accento: false });
  return pezzi.length ? pezzi : [{ testo: titolo, accento: false }];
}

/** «1. Sopralluogo» → «Sopralluogo»: il numero lo mette già l'impaginazione (usciva due volte). */
export function senzaNumeroDavanti(titolo: string): string {
  return String(titolo ?? "").replace(/^\s*\d{1,2}\s*[.):-]\s*/, "").trim();
}

/** «2 settimane» → 14 · «2-3 settimane» → 17,5 · «10 gg» → 10 · «1 mese» → 30. Non si capisce → null. */
export function giorniDellaDurata(durata: string | null | undefined): number | null {
  const s = String(durata ?? "").toLowerCase().replace(",", ".");
  const m = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|a)\s*(\d+(?:\.\d+)?))?\s*(giorn|gg|g\b|settiman|sett|mes)/.exec(s);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  const medio = (a + b) / 2;
  if (!Number.isFinite(medio) || medio <= 0) return null;
  if (m[3].startsWith("sett")) return medio * 7;
  if (m[3].startsWith("mes")) return medio * 30;
  return medio;
}
