/** Le tre cose che possono fermare il disegno del PDF del POS nel browser, e le fasi che l'utente vede. */

/** Il browser non è riuscito a disegnare il PDF: chi chiama può ripiegare sul server (va bene per i POS piccoli). */
export class ErroreDisegnoPos extends Error {}

/** L'utente ha annullato: non è un guasto, quindi non si ripiega sul server e non si mostra nessun errore. */
export class ErroreAnnullato extends Error {
  constructor() { super("Operazione annullata"); }
}

/**
 * Dove si trova l'operazione. Si può annullare in «prepara» e «disegna»; da «conserva» il server potrebbe aver già
 * conservato il documento, e in «server» (il ripiego sulle azioni di sempre) il lavoro è tutto suo.
 * «annullo» è il riscontro subito dopo il clic su «Annulla»: l'operazione si sta fermando, ma il server può metterci
 * un po' a rispondere e senza questa fase il pulsante sembrerebbe ignorare il clic.
 */
export type FasePdf = "prepara" | "disegna" | "conserva" | "server" | "annullo";
export const FASE_ANNULLABILE: ReadonlySet<FasePdf> = new Set<FasePdf>(["prepara", "disegna"]);

/** Il testo di ogni fase: il pulsante lo mostra al posto della sua etichetta mentre l'operazione è in corso. */
const ETICHETTE: Record<FasePdf, string> = {
  prepara: "Preparo il documento…",
  disegna: "Disegno il PDF…",
  conserva: "Lo conservo…",
  server: "Lo preparo sul server…",
  annullo: "Annullo…",
};
export const etichettaFasePdf = (fase: FasePdf | null | undefined): string | undefined => (fase ? ETICHETTE[fase] : undefined);
