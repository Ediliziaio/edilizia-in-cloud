/**
 * avviaIntervalloVisibile — un setInterval che si ferma quando la scheda è
 * nascosta e, al ritorno in primo piano, esegue subito una volta e riparte.
 *
 * 15/09/2026: un setInterval nudo continua a girare nelle schede lasciate
 * aperte di notte; misurato in produzione, ogni scheda inattiva costava
 * centinaia di richieste all'ora. Le query TanStack non ne hanno bisogno
 * (refetchIntervalInBackground: false), questo serve al codice fuori da React Query.
 */
export interface DocumentoVisibile {
  visibilityState: string;
  addEventListener(tipo: "visibilitychange", fn: () => void): void;
  removeEventListener(tipo: "visibilitychange", fn: () => void): void;
}

export function avviaIntervalloVisibile(
  esegui: () => void,
  ms: number,
  doc: DocumentoVisibile | undefined = typeof document !== "undefined" ? document : undefined,
): () => void {
  let id: ReturnType<typeof setInterval> | null = null;

  const avvia = () => {
    if (id === null) id = setInterval(esegui, ms);
  };
  const ferma = () => {
    if (id !== null) {
      clearInterval(id);
      id = null;
    }
  };

  // Senza document (SSR/test): intervallo semplice.
  if (!doc) {
    avvia();
    return ferma;
  }

  const suCambio = () => {
    if (doc.visibilityState === "visible") {
      if (id === null) {
        esegui();
        avvia();
      }
    } else {
      ferma();
    }
  };

  if (doc.visibilityState === "visible") avvia();
  doc.addEventListener("visibilitychange", suCambio);

  return () => {
    ferma();
    doc.removeEventListener("visibilitychange", suCambio);
  };
}
