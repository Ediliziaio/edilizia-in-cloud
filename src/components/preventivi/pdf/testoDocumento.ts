/**
 * Le regole di testo del documento, senza il motore PDF.
 *
 * Stanno fuori da `DocumentoEdilePDF` perché le usa anche l'anteprima di copertina
 * dell'editor: importarle da lì si porterebbe dietro tutto @react-pdf (740 kB)
 * nella pagina dell'editor, che oggi lo carica solo quando si genera il PDF.
 */
import type { DocEdileModello } from "./documentoEdileTipi";

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

/**
 * Le condizioni, articolo per articolo: ogni titolo con il suo testo, così
 * l'impaginazione non lascia un titolo solo in fondo alla pagina. La prima riga,
 * se è il titolo generale, si toglie: la pagina ha già il suo.
 */
export function perArticoli(
  righe: DocEdileModello["condizioniLegali"],
  { senzaClausoleDaFirmare = false } = {},
): Array<typeof righe> {
  const utili = righe.length > 0 && righe[0].tipo === "h1" ? righe.slice(1) : righe;
  const gruppi: Array<typeof righe> = [];
  for (const r of utili) {
    if ((r.tipo === "h1" || r.tipo === "h2") || gruppi.length === 0) gruppi.push([]);
    gruppi[gruppi.length - 1].push(r);
  }
  // L'elenco delle clausole da approvare a parte sta sulla pagina della firma,
  // accanto alla seconda firma: qui sarebbe una ripetizione, e da sola si
  // portava via una pagina intera.
  if (!senzaClausoleDaFirmare) return gruppi;
  return gruppi.filter((g) => !/1341|approvare specificamente/i.test(g[0]?.testo ?? ""));
}
