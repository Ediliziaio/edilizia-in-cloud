/**
 * Le schede tecniche dei prodotti scelti, in fondo al preventivo classico (07/11/2026).
 *
 * Florin: «nel preventivo classico, se seleziono determinati prodotti dove ho ovviamente le schede tecniche,
 * escono fuori anche le schede tecniche». Nel listino la scheda sta sull'articolo o sulla sua famiglia
 * (`pdf_scheda_url`): un link dello storage dell'app o il sito del produttore. Con «Allega schede tecniche PDF»
 * acceso, `generate-quote-pdf` le aggiunge dopo i documenti allegati a mano.
 *
 * Il file lo scarica il server, da un indirizzo scritto da un utente dell'azienda: solo https, solo un PDF vero
 * (si guarda l'inizio del file, non l'estensione), al più 10 MB, 10 secondi; al più 10 schede per preventivo.
 * Una scheda che non arriva si salta: il preventivo esce lo stesso.
 */

export const SCHEDE_MASSIME = 10;
export const SCHEDA_BYTE_MASSIMI = 10 * 1024 * 1024;
export const SCHEDA_ATTESA_MS = 10_000;

type RigaConProdotto = { article_template_id?: unknown; family_id?: unknown };

/** Gli indirizzi delle schede da allegare, nell'ordine delle righe: quella dell'articolo, se no della famiglia. */
export function schedeDaAllegare(
  righe: RigaConProdotto[],
  articoli: ReadonlyMap<string, string>,
  famiglie: ReadonlyMap<string, string>,
): string[] {
  const viste = new Set<string>();
  for (const r of righe) {
    const art = typeof r.article_template_id === "string" ? articoli.get(r.article_template_id) : undefined;
    const fam = typeof r.family_id === "string" ? famiglie.get(r.family_id) : undefined;
    const url = (art || fam || "").trim();
    if (!url || !/^https:\/\//i.test(url) || viste.has(url)) continue;
    viste.add(url);
    if (viste.size >= SCHEDE_MASSIME) break;
  }
  return [...viste];
}

/** È un PDF? Lo dicono i primi byte («%PDF»), non il nome del file. */
export function ePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** Scarica una scheda. Null se non è https, non risponde, è troppo grande o non è un PDF. */
export async function scaricaScheda(
  url: string,
  scarica: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<Uint8Array | null> {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const risposta = await scarica(url, { redirect: "follow", signal: AbortSignal.timeout(SCHEDA_ATTESA_MS) });
    if (!risposta.ok) return null;
    const dichiarati = Number(risposta.headers.get("content-length") ?? "0");
    if (dichiarati > SCHEDA_BYTE_MASSIMI) return null;
    const bytes = new Uint8Array(await risposta.arrayBuffer());
    if (bytes.length > SCHEDA_BYTE_MASSIMI || !ePdf(bytes)) return null;
    return bytes;
  } catch {
    return null;
  }
}
