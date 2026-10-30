import type { ParametriDisegnoPos } from "../../../supabase/functions/_shared/posPdfBrowser";
import type { MessaggioPdfWorker } from "./posPdf.worker";
import { ErroreAnnullato } from "./posPdfErrori";

/**
 * Disegna il PDF del POS nel browser, in un Worker (la pagina resta viva). Dove il Worker non c'è (ambienti di prova,
 * browser molto vecchi) si disegna nel thread principale: stesso codice, solo senza la pagina libera nel frattempo.
 *
 * Due attese distinte, perché in una WebView (iOS, Android) un Worker può non partire senza dare errori:
 *  - l'avvio: il Worker dice «pronto» appena è caricato; se non lo dice entro `tempoAvvioMs` (30 s: il file è di 2 MB e
 *    la rete può essere lenta) si chiude e si segnala, così chi chiama ripiega sul server invece di aspettare i minuti del disegno;
 *  - il disegno: dal «pronto» ha `tempoMassimoMs` (150 s).
 * Col segnale di annullamento il Worker si chiude subito.
 */
export interface OpzioniDisegno { tempoAvvioMs?: number; tempoMassimoMs?: number; segnale?: AbortSignal }
const TEMPO_AVVIO_MS = 30_000;
const TEMPO_MASSIMO_MS = 150_000;

export async function disegnaPdfPosNelBrowser(p: ParametriDisegnoPos, o: OpzioniDisegno = {}): Promise<Uint8Array> {
  if (o.segnale?.aborted) throw new ErroreAnnullato();
  if (typeof Worker === "undefined") {
    const bytes = await (await import("./posPdfMotore")).disegnaConPdfmake(p);
    if (o.segnale?.aborted) throw new ErroreAnnullato();
    return bytes;
  }
  const worker = new Worker(new URL("./posPdf.worker.ts", import.meta.url), { type: "module" });
  return new Promise<Uint8Array>((risolvi, rifiuta) => {
    let attesa: ReturnType<typeof setTimeout>;
    const annulla = () => finisci(new ErroreAnnullato());
    const finisci = (esito: Uint8Array | Error) => {
      clearTimeout(attesa);
      o.segnale?.removeEventListener("abort", annulla);
      worker.terminate();
      if (esito instanceof Error) rifiuta(esito); else risolvi(esito);
    };
    attesa = setTimeout(() => finisci(new Error("Il browser non riesce ad avviare il disegno del PDF")), o.tempoAvvioMs ?? TEMPO_AVVIO_MS);
    o.segnale?.addEventListener("abort", annulla, { once: true });
    worker.onmessage = (ev: MessageEvent<MessaggioPdfWorker>) => {
      if (ev.data.tipo === "pronto") {
        clearTimeout(attesa);
        attesa = setTimeout(() => finisci(new Error("Il disegno del PDF sta richiedendo troppo tempo: riprova")), o.tempoMassimoMs ?? TEMPO_MASSIMO_MS);
      } else if (ev.data.tipo === "fatto") finisci(ev.data.bytes);
      else finisci(new Error(ev.data.messaggio));
    };
    worker.onerror = (ev) => finisci(new Error(ev.message || "Il PDF non è stato disegnato"));
    worker.postMessage(p);
  });
}
