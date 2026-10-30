import type { ParametriDisegnoPos } from "../../../supabase/functions/_shared/posPdfBrowser";
import type { MessaggioPdfWorker } from "./posPdf.worker";

/**
 * Disegna il PDF del POS nel browser, in un Worker (la pagina resta viva). Dove il Worker non c'è (ambienti di prova,
 * browser molto vecchi) si disegna nel thread principale: stesso codice, solo senza la pagina libera nel frattempo.
 * Un Worker che non risponde non lascia l'utente ad aspettare: oltre il tempo massimo si chiude e si segnala l'errore.
 */
const TEMPO_MASSIMO_MS = 150_000;

export async function disegnaPdfPosNelBrowser(p: ParametriDisegnoPos, tempoMassimoMs = TEMPO_MASSIMO_MS): Promise<Uint8Array> {
  if (typeof Worker === "undefined") return (await import("./posPdfMotore")).disegnaConPdfmake(p);
  const worker = new Worker(new URL("./posPdf.worker.ts", import.meta.url), { type: "module" });
  return new Promise<Uint8Array>((risolvi, rifiuta) => {
    const attesa = setTimeout(() => { chiudi(); rifiuta(new Error("Il disegno del PDF sta richiedendo troppo tempo: riprova")); }, tempoMassimoMs);
    const chiudi = () => { clearTimeout(attesa); worker.terminate(); };
    worker.onmessage = (ev: MessageEvent<MessaggioPdfWorker>) => {
      chiudi();
      if (ev.data.tipo === "fatto") risolvi(ev.data.bytes); else rifiuta(new Error(ev.data.messaggio));
    };
    worker.onerror = (ev) => { chiudi(); rifiuta(new Error(ev.message || "Il PDF non è stato disegnato")); };
    worker.postMessage(p);
  });
}
