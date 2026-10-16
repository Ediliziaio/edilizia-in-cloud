/** Raggruppa le colonne, mantenendo separata la cancellazione dei consumer. */
export function creaPrimePagineCancellabili<Args extends { stageId: string }, Riga>(
  chiavePer: (args: Args) => string,
  leggi: (args: Args, fasi: string[], signal: AbortSignal) => Promise<Record<string, Riga[]>>,
) {
  type Attesa = {
    resolve: (righe: Riga[]) => void;
    reject: (errore: unknown) => void;
    signal?: AbortSignal;
    cancel: () => void;
    conclusa: boolean;
  };
  type Gruppo = {
    args: Args;
    colonne: Map<string, Set<Attesa>>;
    controller: AbortController;
    timer?: ReturnType<typeof setTimeout>;
  };
  const inAttesa = new Map<string, Gruppo>();
  return (args: Args, signal?: AbortSignal): Promise<Riga[]> => {
    const motivo = () => signal?.reason ?? new DOMException('Ricerca annullata', 'AbortError');
    if (signal?.aborted) return Promise.reject(motivo());
    const chiave = chiavePer(args);
    let gruppo = inAttesa.get(chiave);
    if (!gruppo) {
      gruppo = {args, colonne: new Map(), controller: new AbortController()};
      inAttesa.set(chiave, gruppo);
      const corrente = gruppo;
      corrente.timer = setTimeout(() => {
        if (inAttesa.get(chiave) === corrente) inAttesa.delete(chiave);
        if (corrente.controller.signal.aborted) return;
        const concludi = (esito: {righe: Record<string, Riga[]>} | {errore: unknown}) => {
          for (const [fase, attese] of corrente.colonne) for (const attesa of attese) {
            attesa.conclusa = true;
            attesa.signal?.removeEventListener('abort', attesa.cancel);
            if ('errore' in esito) attesa.reject(esito.errore);
            else attesa.resolve(Array.isArray(esito.righe[fase]) ? esito.righe[fase] : []);
          }
          corrente.colonne.clear();
        };
        void Promise.resolve().then(() => {
          if (corrente.controller.signal.aborted) throw corrente.controller.signal.reason;
          return leggi(corrente.args, [...corrente.colonne.keys()], corrente.controller.signal);
        }).then(righe => concludi({righe}), errore => concludi({errore}));
      }, 15);
    }
    const corrente = gruppo;
    return new Promise<Riga[]>((resolve, reject) => {
      const attesa: Attesa = {
        resolve, reject, signal, conclusa: false,
        cancel: () => {
          if (attesa.conclusa) return;
          attesa.conclusa = true;
          signal?.removeEventListener('abort', attesa.cancel);
          const attese = corrente.colonne.get(args.stageId);
          attese?.delete(attesa);
          if (!attese?.size) corrente.colonne.delete(args.stageId);
          reject(motivo());
          if (!corrente.colonne.size) {
            clearTimeout(corrente.timer);
            if (inAttesa.get(chiave) === corrente) inAttesa.delete(chiave);
            corrente.controller.abort(motivo());
          }
        },
      };
      let attese = corrente.colonne.get(args.stageId);
      if (!attese) { attese = new Set(); corrente.colonne.set(args.stageId, attese); }
      attese.add(attesa);
      signal?.addEventListener('abort', attesa.cancel, {once: true});
    });
  };
}
