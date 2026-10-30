/**
 * Le versioni del modello di stampa del POS. Codice puro, senza dipendenze: lo importano il server e il browser.
 *
 * LAYOUT_POS_VERSIONE cambia quando cambia l'HTML del modello (posHtml.ts) o il suo layout (posPdfLayout.ts). Il PDF lo
 * disegna il browser a partire dall'HTML costruito dal server: se le due metà non sono della stessa versione (app già
 * installata più vecchia del server, o il contrario) il PDF non si disegna e l'utente è invitato ad aggiornare.
 */
export const LAYOUT_POS_VERSIONE = "pos-pdf-9-riferimento-psc";
/** Chi ha disegnato il PDF resta scritto nel manifest dell'emissione. */
export const VERSIONE_RENDERER_POS = `${LAYOUT_POS_VERSIONE}/pdfmake-0.3.9`;
export const VERSIONE_RENDERER_POS_BROWSER = `${LAYOUT_POS_VERSIONE}-browser/pdfmake-0.3.9`;
