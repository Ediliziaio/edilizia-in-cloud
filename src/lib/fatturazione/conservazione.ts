/**
 * Conservazione obbligatoria dei documenti fiscali.
 *
 * Stessa regola della funzione `documento_fiscale_e_immutabile` sul database
 * (che alimenta il trigger di protezione): tenerle allineate: se cambia una,
 * cambia l'altra. Serve all'interfaccia per non promettere cancellazioni che
 * non avverranno mai — il cestino mostrava "14 giorni rimasti" anche a fatture
 * che per legge restano archiviate.
 */

const TIPI_DA_CONSERVARE = new Set([
  "fattura",
  "fattura_pa",
  "nota_credito",
  "nota_debito",
  "autofattura",
  "fattura_riepilogativa",
  "ddt",
]);

/** true = il documento non può essere cancellato: va conservato. */
export function documentoDaConservare(tipo: string | null | undefined, stato: string | null | undefined): boolean {
  if (!tipo) return false;
  return TIPI_DA_CONSERVARE.has(tipo) && stato !== "bozza";
}
