/// <reference lib="webworker" />
/**
 * Lettura del disegno CAD fuori dalla pagina: il file si legge a pezzi dal
 * disco (File.stream), si decodifica e passa a LettoreDxf senza mai tenere
 * tutto il testo in memoria. La pagina riceve l'avanzamento e, alla fine, il
 * disegno ridotto a quello che serve per contare.
 */
import { LettoreDxf, riconosciFormato } from "./leggiDxf";

export type MessaggioWorker =
  | { tipo: "avanzamento"; letti: number; totale: number }
  | { tipo: "fatto"; disegno: ReturnType<LettoreDxf["fine"]> }
  | { tipo: "errore"; codice: "dwg" | "dxf_binario" | "sconosciuto" | "memoria" | "lettura"; messaggio: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<{ file: File }>) => {
  const file = ev.data.file;
  const manda = (m: MessaggioWorker) => ctx.postMessage(m);
  try {
    const formato = riconosciFormato(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
    if (formato !== "dxf") {
      manda({ tipo: "errore", codice: formato, messaggio: formato });
      return;
    }
    const lettore = new LettoreDxf();
    const decoder = new TextDecoder("utf-8");
    const reader = file.stream().getReader();
    let letti = 0;
    let ultimo = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      letti += value.byteLength;
      lettore.aggiungi(decoder.decode(value, { stream: true }));
      if (letti - ultimo > 4_000_000) { ultimo = letti; manda({ tipo: "avanzamento", letti, totale: file.size }); }
    }
    lettore.aggiungi(decoder.decode());
    manda({ tipo: "avanzamento", letti: file.size, totale: file.size });
    manda({ tipo: "fatto", disegno: lettore.fine() });
  } catch (e) {
    const memoria = e instanceof RangeError || /memory|allocation/i.test(String(e));
    manda({ tipo: "errore", codice: memoria ? "memoria" : "lettura", messaggio: e instanceof Error ? e.message : String(e) });
  }
};
