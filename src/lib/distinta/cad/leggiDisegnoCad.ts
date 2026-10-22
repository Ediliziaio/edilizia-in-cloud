/**
 * Legge un file DXF nel Web Worker (la pagina non si blocca) e traduce gli
 * errori in parole: DWG da salvare come DXF, file troppo grande per il browser.
 *
 * DWG: nessuna libreria adatta da mettere nel prodotto. Le uniche capaci di
 * leggere i DWG nel browser (es. @mlightcad/libredwg-web) sono LibreDWG
 * compilata in WASM, con licenza GPL-3.0: inserirla nell'app distribuita ai
 * clienti chiede una decisione del titolare. Finché non c'è, il DWG si salva
 * come DXF dal CAD (o con un convertitore gratuito) e si carica quello.
 */
import type { DisegnoCad } from "./leggiDxf";
import type { MessaggioWorker } from "./leggiDisegno.worker";

/** Oltre questa dimensione il browser di un portatile normale rischia di non farcela. */
export const LIMITE_DXF_BYTE = 900 * 1024 * 1024;

export const ISTRUZIONI_DWG =
  "Il file è un DWG: il gestionale legge il formato DXF, che contiene gli stessi dati. In AutoCAD (o BricsCAD, ZWCAD, progeCAD) apri il disegno e usa «Salva con nome» → tipo «DXF» (va bene la versione 2018), poi carica qui il DXF. Senza CAD: ODA File Converter, gratuito, converte DWG in DXF.";

export class ErroreDisegno extends Error {
  constructor(public codice: string, messaggio: string) { super(messaggio); }
}

function messaggioErrore(codice: string, tecnico: string): string {
  switch (codice) {
    case "dwg": return ISTRUZIONI_DWG;
    case "dxf_binario": return "È un DXF binario: salvalo di nuovo come DXF di testo (ASCII) e ricaricalo.";
    case "sconosciuto": return "Il file non sembra un disegno DXF. Carica un .dxf (o un PDF per le tavole stampate).";
    case "memoria": return "Il disegno è troppo grande per questo browser. Nel CAD salva un DXF con solo i layer degli impianti (o una parte dell'edificio per volta) e riprova.";
    default: return `Disegno non letto: ${tecnico}`;
  }
}

export function leggiDisegnoCad(file: File, avanzamento?: (frazione: number) => void): { promessa: Promise<DisegnoCad>; annulla: () => void } {
  if (file.size > LIMITE_DXF_BYTE) {
    return { promessa: Promise.reject(new ErroreDisegno("memoria", messaggioErrore("memoria", ""))), annulla: () => undefined };
  }
  const worker = new Worker(new URL("./leggiDisegno.worker.ts", import.meta.url), { type: "module" });
  let rifiuta: (e: Error) => void = () => undefined;
  const promessa = new Promise<DisegnoCad>((resolve, reject) => {
    rifiuta = reject;
    worker.onmessage = (ev: MessageEvent<MessaggioWorker>) => {
      const m = ev.data;
      if (m.tipo === "avanzamento") avanzamento?.(m.totale ? m.letti / m.totale : 0);
      else if (m.tipo === "fatto") { worker.terminate(); resolve(m.disegno); }
      else { worker.terminate(); reject(new ErroreDisegno(m.codice, messaggioErrore(m.codice, m.messaggio))); }
    };
    worker.onerror = (ev) => {
      worker.terminate();
      const codice = /memory|allocation/i.test(ev.message ?? "") ? "memoria" : "lettura";
      reject(new ErroreDisegno(codice, messaggioErrore(codice, ev.message ?? "errore del lettore")));
    };
    worker.postMessage({ file });
  });
  return { promessa, annulla: () => { worker.terminate(); rifiuta(new ErroreDisegno("annullato", "Lettura annullata")); } };
}
