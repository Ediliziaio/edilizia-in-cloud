/**
 * Il disegno del PDF del POS fuori dalla pagina: pdfmake lavora da mezzo secondo a qualche secondo, e in quel tempo
 * la pagina non deve bloccarsi. Riceve i parametri del disegno e risponde con i byte del PDF, o con l'errore.
 */
import { disegnaConPdfmake } from "./posPdfMotore";
import type { ParametriDisegnoPos } from "../../../supabase/functions/_shared/posPdfBrowser";

export type MessaggioPdfWorker =
  | { tipo: "fatto"; bytes: Uint8Array }
  | { tipo: "errore"; messaggio: string };

// Tipo minimo del worker: niente lib «webworker» che si mescolerebbe al DOM dell'app.
const ctx = self as unknown as {
  postMessage: (m: MessaggioPdfWorker, trasferiti?: Transferable[]) => void;
  onmessage: ((ev: MessageEvent<ParametriDisegnoPos>) => void) | null;
};

ctx.onmessage = async (ev: MessageEvent<ParametriDisegnoPos>) => {
  try {
    const bytes = await disegnaConPdfmake(ev.data);
    ctx.postMessage({ tipo: "fatto", bytes }, [bytes.buffer]);
  } catch (e) {
    ctx.postMessage({ tipo: "errore", messaggio: e instanceof Error && e.message ? e.message : "Il PDF non è stato disegnato" });
  }
};
