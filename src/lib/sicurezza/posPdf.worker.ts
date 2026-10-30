/**
 * Il disegno del PDF del POS fuori dalla pagina: pdfmake lavora da mezzo secondo a qualche secondo, e in quel tempo
 * la pagina non deve bloccarsi. Riceve i parametri del disegno e risponde con i byte del PDF, o con l'errore.
 *
 * Gli import sono statici di proposito: in produzione un Worker è un file unico (IIFE) e non può caricare pezzi dopo
 * con import(). Non pesa comunque sulla pagina: il Worker si scarica solo quando c'è un PDF da disegnare
 * (posPdfBrowserMotore.test.ts e posPdfWorkerBundle.test.ts).
 */
import pdfMake from "pdfmake/build/pdfmake.min.js";
import vfs from "pdfmake/build/vfs_fonts.js";
import { disegnaPdfPos, type ParametriDisegnoPos } from "../../../supabase/functions/_shared/posPdfBrowser";
import { registraFontPos } from "../../../supabase/functions/_shared/posFont";

export type MessaggioPdfWorker =
  | { tipo: "pronto" }
  | { tipo: "fatto"; bytes: Uint8Array }
  | { tipo: "errore"; messaggio: string };

pdfMake.addVirtualFileSystem(vfs);
// Le caselle del modello (☐ ☒) hanno un mini-font proprio, come sul server (posPdf.ts).
registraFontPos(pdfMake);

// Tipo minimo del worker: niente lib «webworker» che si mescolerebbe al DOM dell'app.
const ctx = self as unknown as {
  postMessage: (m: MessaggioPdfWorker, trasferiti?: Transferable[]) => void;
  onmessage: ((ev: MessageEvent<ParametriDisegnoPos>) => void) | null;
};

// Dice che il file è caricato e le librerie pronte: senza questo messaggio la pagina sa che il Worker non è partito.
ctx.postMessage({ tipo: "pronto" });

ctx.onmessage = async (ev: MessageEvent<ParametriDisegnoPos>) => {
  try {
    const bytes = await disegnaPdfPos(pdfMake, ev.data);
    ctx.postMessage({ tipo: "fatto", bytes }, [bytes.buffer]);
  } catch (e) {
    ctx.postMessage({ tipo: "errore", messaggio: e instanceof Error && e.message ? e.message : "Il PDF non è stato disegnato" });
  }
};
