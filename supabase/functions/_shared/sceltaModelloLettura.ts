/**
 * Quale modello legge un contratto, un preventivo o un computo (17/11/2026).
 *
 * Misurato sul banco (work/banco-ai, 7 documenti veri × 9 modelli):
 * - Claude Haiku 5.5 legge perfettamente i preventivi brevi stampati da PDF (righe, quantità, importi, tipo)
 *   a meno di un centesimo di dollaro, ma su un contratto scansionato di 76 pagine risponde con un JSON rotto;
 * - Claude Sonnet 5.5 è giusto su tutto, anche sul contratto lungo e sulle scansioni, a circa 0,10–0,35 $;
 * - Gemini 2.5 Flash, il modello di prima, tiene la riga «a corpo» col totale e sbaglia l'importo del contratto.
 *
 * Quindi: Haiku per i documenti brevi e testuali, Sonnet per i lunghi, le scansioni e le foto, e Sonnet
 * anche quando Haiku non dà una risposta leggibile o completa.
 */

export const MODELLO_LETTURA_BREVE = "anthropic/claude-haiku-5.5";
export const MODELLO_LETTURA_ACCURATA = "anthropic/claude-sonnet-5.5";

/** Oltre queste pagine un documento è «lungo». */
export const PAGINE_MAX_BREVE = 8;
/** Oltre questo peso medio per pagina il PDF è una scansione (immagini), non testo. */
export const BYTE_PER_PAGINA_MAX_TESTO = 400 * 1024;

/**
 * Le pagine di un PDF contando gli oggetti `/Type /Page` (non `/Pages`). Con i PDF a flussi di oggetti
 * compressi il conteggio può dare 0: allora si risponde null e decide il peso.
 */
export function contaPaginePdf(bytes: Uint8Array): number | null {
  // latin1 conserva un byte per carattere: basta per cercare le parole chiave del PDF.
  const testo = new TextDecoder("latin1").decode(bytes);
  const n = (testo.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  return n > 0 ? n : null;
}

export interface DocumentoDaLeggere {
  mime: string | null;
  byte: number;
  pagine: number | null;
}

/** Il primo modello da usare: Haiku solo per testo incollato e PDF brevi non scansionati. */
export function primoModelloLettura(d: DocumentoDaLeggere): string {
  const mime = d.mime ?? "";
  if (mime.startsWith("text/")) return MODELLO_LETTURA_BREVE;
  if (mime.startsWith("image/")) return MODELLO_LETTURA_ACCURATA;
  if (d.pagine == null) {
    // Pagine ignote: un PDF piccolo è breve, uno grande no.
    return d.byte <= 1.5 * 1024 * 1024 ? MODELLO_LETTURA_BREVE : MODELLO_LETTURA_ACCURATA;
  }
  if (d.pagine > PAGINE_MAX_BREVE) return MODELLO_LETTURA_ACCURATA;
  if (d.byte / d.pagine > BYTE_PER_PAGINA_MAX_TESTO) return MODELLO_LETTURA_ACCURATA;
  return MODELLO_LETTURA_BREVE;
}

/**
 * Se la lettura di Haiku va rifatta con Sonnet: risposta illeggibile, oppure un documento con un importo
 * ma senza nessuna voce (la lettura «solo il totale» che il 17/11 capitava con Flash).
 */
export function serveLetturaAccurata(estratto: Record<string, unknown> | null): boolean {
  if (!estratto) return true;
  const voci = Array.isArray(estratto.voci) ? estratto.voci : [];
  const importo = Number(estratto.importo_totale_eur ?? estratto.importo_totale_ivato_eur ?? 0);
  return voci.length === 0 && importo > 0;
}
