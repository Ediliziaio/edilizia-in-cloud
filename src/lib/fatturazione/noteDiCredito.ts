/**
 * I tipi di documento che valgono come nota di credito ricevuta: FatturaPA
 * TD04 (nota di credito) e TD08 (nota di credito semplificata), e le note
 * importate con il tipo interno «passive_credit_note». Un solo elenco, usato
 * da tutti i conti sui fornitori.
 */
export const NOTE_DI_CREDITO: ReadonlySet<string> = new Set(["TD04", "TD08", "passive_credit_note"]);

/** Vero se il tipo di documento è una nota di credito. */
export function eNotaDiCredito(tipo: string | null | undefined): boolean {
  return !!tipo && NOTE_DI_CREDITO.has(tipo.trim());
}
