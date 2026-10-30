import { layoutPdfPos } from "./posPdfLayout.ts";
import { LAYOUT_POS_VERSIONE } from "./posRenderer.ts";

/**
 * Il disegno del PDF fuori dal server. Il server ha 2 secondi di CPU per richiesta e pdfmake ne chiede 0,5 a 21 pagine,
 * 2,1 a 293: il browser prende l'HTML del modello costruito dal server e fa lo stesso lavoro, con lo stesso layout e lo
 * stesso pdfmake. Il motore si passa da fuori (nel browser è il bundle di pdfmake nel Worker, nei test quello di Deno):
 * questo file non importa né pdfmake né i font.
 */
export interface MotorePdf {
  createPdf(definizione: never): { getBuffer(): Promise<Uint8Array> };
}
export interface ParametriDisegnoPos {
  html: string;
  codice: string;
  revisione: number;
  emessoIl: string;
  anteprima: boolean;
  /** Il layout con cui il server ha costruito l'HTML: se non è quello di questo codice, non si disegna. */
  layoutServer?: string;
}

export async function disegnaPdfPos(motore: MotorePdf, p: ParametriDisegnoPos): Promise<Uint8Array> {
  if (p.layoutServer !== undefined && p.layoutServer !== LAYOUT_POS_VERSIONE) {
    throw new Error("Il documento è stato preparato con un modello di stampa diverso da quello di questa app: aggiorna l'app e riprova.");
  }
  const layout = layoutPdfPos(p.html, p.codice, p.revisione, p.emessoIl, p.anteprima);
  // Una copia semplice: il buffer di pdfmake nel browser è una sottoclasse di Uint8Array.
  const bytes = new Uint8Array(await motore.createPdf(layout.definizione as never).getBuffer());
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Il generatore non ha prodotto un PDF");
  return bytes;
}
