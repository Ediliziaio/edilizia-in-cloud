/**
 * Il JSON che il modello risponde, quando c'è.
 *
 * La logica (graffe bilanciate, risposta troncata) sta in `_shared/rispostaModello.ts`,
 * dove la usano anche le altre funzioni che leggono documenti: qui resta il nome
 * con cui la importa questa funzione. La storia del guasto del 28/10/2026 è
 * raccontata là.
 */
export { oggettoBilanciato as jsonDalModello } from "../_shared/rispostaModello.ts";
export type { OggettoBilanciato as JsonDalModello } from "../_shared/rispostaModello.ts";
