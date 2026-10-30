/**
 * Le versioni del modello di stampa del POS. Codice puro, senza dipendenze: lo importano il server e il browser.
 *
 * LAYOUT_POS_VERSIONE cambia quando cambia l'HTML del modello (posHtml.ts) o il suo layout (posPdfLayout.ts). Il PDF lo
 * disegna il browser a partire dall'HTML costruito dal server: se le due metà non sono della stessa versione (app già
 * installata più vecchia del server, o il contrario) il PDF non si disegna e l'utente è invitato ad aggiornare.
 */
export const LAYOUT_POS_VERSIONE = "pos-pdf-10-design";
/**
 * Chi ha disegnato il PDF resta scritto nel manifest dell'emissione. Quella del server (VERSIONE_RENDERER_POS) vive in
 * posPdf.ts, che carica pdfmake; un test (posRendererCoerenza_test.ts) verifica che sia questo layout più pdfmake-0.3.9.
 */
export const VERSIONE_RENDERER_POS_BROWSER = `${LAYOUT_POS_VERSIONE}-browser/pdfmake-0.3.9`;
/** Il PDF che il browser carica per un'emissione: un POS di 293 pagine pesa circa 2 MB. */
export const LIMITE_PDF_BROWSER = 25 * 1024 * 1024;
