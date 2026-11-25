/**
 * Prima i dati, poi l'AI: se il PDF ha già il testo dentro, si manda il testo
 * e non il PDF (25/11/2026).
 *
 * Misura dei 30 giorni al 25/11: il compito `pdf_vision_extract` ha fatto 340
 * chiamate, 4,67 € di costo reale e 16,26 € addebitati alle aziende. Una buona
 * parte di quei documenti — bolle, ordini, condizioni emessi da un gestionale —
 * sono PDF con lo strato di testo dentro: il modello di visione lì non serve a
 * niente, e costa perché deve guardare le pagine invece di leggerle.
 *
 * Il progetto sapeva già farlo (`pdfExtraction.ts`, usato da computo, Silvio,
 * POS e bollette): mancava in cinque funzioni, che mandavano sempre il file.
 *
 * La regola è volutamente prudente, perché un documento letto peggio costa più
 * di una chiamata in più: si usa il testo SOLO se tutto il documento è stato
 * letto (nessuna pagina senza testo, nessuna pagina oltre il budget) e se ogni
 * pagina ne ha abbastanza. Un PDF scansionato, o misto (intestazione scritta e
 * tabella fotografata), ricade sulla strada di prima.
 */
import { incorniciaTestoDocumento } from "./documentoNonFidato.ts";
import { estraiPagineTestoTabella } from "./pdfExtraction.ts";

/** Sotto questa soglia la pagina è un'immagine con due parole sopra, non un testo. */
export const MIN_CARATTERI_PAGINA = 300;
export const MIN_CARATTERI_TOTALE = 800;
export const MAX_PAGINE_TESTO = 20;
export const MAX_CARATTERI_TESTO = 120_000;

export type PagineEstratte = {
  pagine: Array<{ pagina: number; testo: string }>;
  illeggibili: number[];
  ispezionate: number;
  totale: number;
};

/**
 * Il testo da mandare al modello, o `null` se non è il caso di fidarsi.
 * Separata dalla lettura del PDF per poterla provare senza un PDF vero.
 */
export function testoUtilizzabile(estratto: PagineEstratte): string | null {
  const { pagine, illeggibili, ispezionate, totale } = estratto;
  // Una pagina senza testo è una scansione: il documento va guardato, non letto.
  if (illeggibili.length > 0) return null;
  // Se non abbiamo visto tutte le pagine (troppe, o testo oltre il budget) non
  // possiamo sostituire il file: ci perderemmo quello che non abbiamo letto.
  if (!pagine.length || ispezionate !== totale) return null;
  if (pagine.some((p) => p.testo.trim().length < MIN_CARATTERI_PAGINA)) return null;
  const testo = pagine
    .map((p) => `### Pagina ${p.pagina} di ${totale}\n${p.testo.trim()}`)
    .join("\n\n");
  if (testo.length < MIN_CARATTERI_TOTALE) return null;
  return incorniciaTestoDocumento(testo);
}

/**
 * Il testo dentro il PDF, pronto per il messaggio dell'utente, o `null` se il
 * documento va mandato com'è. Non lancia: qualunque problema vale `null`.
 */
export async function testoDentroIlPdf(
  bytes: Uint8Array,
  opzioni: { maxPagine?: number; maxCaratteri?: number } = {},
): Promise<string | null> {
  try {
    const estratto = await estraiPagineTestoTabella(
      bytes,
      opzioni.maxPagine ?? MAX_PAGINE_TESTO,
      opzioni.maxCaratteri ?? MAX_CARATTERI_TESTO,
    );
    return testoUtilizzabile(estratto);
  } catch {
    // Il PDF non si apre o il lettore non c'è: va al modello come prima.
    return null;
  }
}
