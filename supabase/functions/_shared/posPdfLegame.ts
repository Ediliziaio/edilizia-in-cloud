/**
 * Il legame che un PDF disegnato dal browser dichiara nel suo dizionario Info: a quale emissione appartiene, l'impronta
 * SHA-256 del modello HTML costruito dal server e la versione del layout. Il server non può rifare il PDF per
 * confrontarlo (costerebbe la CPU che si è voluta togliere), ma può controllare che il file sia stato disegnato per
 * QUESTA emissione e per QUESTO contenuto: un POS cambiato nel frattempo o un PDF di un'altra emissione non passano.
 *
 * Si legge solo ciò che la tabella xref finale dichiara come dizionario Info: testo aggiunto dopo la fine del file o
 * nascosto altrove non conta. pdfkit scrive i valori del dizionario come oggetti indiretti («/PosEmissione 16 0 R»).
 * Codice puro, senza Deno né browser.
 */
export interface LegamePdfPos { emissioneId: string; htmlSha256: string; layout: string }

const latin1 = new TextDecoder("latin1");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function oggettiXref(pdf: Uint8Array): number[] | null {
  const coda = latin1.decode(pdf.subarray(Math.max(0, pdf.length - 2048)));
  const start = [...coda.matchAll(/startxref\s+(\d+)\s*%%EOF/g)].pop();
  if (!start) return null;
  const inizio = Number(start[1]);
  if (!Number.isSafeInteger(inizio) || inizio >= pdf.length) return null;
  const testata = /^xref\s+0\s+(\d+)\s/.exec(latin1.decode(pdf.subarray(inizio, inizio + 64)));
  if (!testata) return null;
  const conteggio = Number(testata[1]);
  if (!Number.isSafeInteger(conteggio) || conteggio < 1 || conteggio > 200_000) return null;
  const tabella = latin1.decode(pdf.subarray(inizio, inizio + 32 + conteggio * 21));
  return [...tabella.matchAll(/(\d{10}) \d{5} [nf]/g)].slice(0, conteggio).map(m => Number(m[1]));
}

function corpoOggetto(pdf: Uint8Array, offsets: number[], numero: number): string | null {
  const offset = offsets[numero];
  if (!offset || offset >= pdf.length) return null;
  const m = new RegExp(`^${numero}\\s+0\\s+obj\\s*([\\s\\S]*?)\\s*endobj`).exec(latin1.decode(pdf.subarray(offset, offset + 4096)));
  return m ? m[1] : null;
}

const stringa = (letterale: string) => letterale.replace(/\\([()\\])/g, "$1");

export function leggiLegamePdfPos(pdf: Uint8Array): LegamePdfPos | null {
  try {
    const offsets = oggettiXref(pdf);
    if (!offsets) return null;
    const coda = latin1.decode(pdf.subarray(Math.max(0, pdf.length - 2048)));
    const info = [...coda.matchAll(/\/Info\s+(\d+)\s+0\s+R/g)].pop();
    const dizionario = info && corpoOggetto(pdf, offsets, Number(info[1]));
    if (!dizionario) return null;
    const valore = (chiave: string): string | null => {
      const m = new RegExp(`/${chiave}\\s*(?:\\(((?:[^()\\\\]|\\\\.)*)\\)|(\\d+)\\s+0\\s+R)`).exec(dizionario);
      if (!m) return null;
      if (m[1] !== undefined) return stringa(m[1]);
      const o = corpoOggetto(pdf, offsets, Number(m[2]));
      const l = o && /^\(((?:[^()\\]|\\.)*)\)$/.exec(o);
      return l ? stringa(l[1]) : null;
    };
    const emissioneId = valore("PosEmissione"), htmlSha256 = valore("PosHtmlSha256"), layout = valore("PosLayout");
    if (!emissioneId || !UUID.test(emissioneId) || !htmlSha256 || !SHA256.test(htmlSha256) || !layout) return null;
    return { emissioneId, htmlSha256: htmlSha256.toLowerCase(), layout };
  } catch {
    return null;
  }
}
