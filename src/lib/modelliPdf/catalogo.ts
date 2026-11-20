import type { ModelloPdf } from "../../../supabase/functions/_shared/modelliPdfOperativi";

export {
  TIPI_MODELLI_PDF,
  NOMI_MODELLI_PDF,
  modelloPdfStandard,
  normalizzaModelloPdf,
} from "../../../supabase/functions/_shared/modelliPdfOperativi";
export type {
  ModelloPdf,
  TipoModelloPdf,
  SceltaClausola,
} from "../../../supabase/functions/_shared/modelliPdfOperativi";
/** I valori da trasferire tra due tipi di documento quando si copia l'impaginazione. */
export function aspettoDelModello(modello: ModelloPdf) {
  return {
    colore: modello.colore,
    carattere: modello.carattere,
    mostraLogo: modello.mostraLogo,
    scalaLogo: modello.scalaLogo,
    margine: modello.margine,
    dimensioneTesto: modello.dimensioneTesto,
    coloreRiquadri: modello.coloreRiquadri,
    righeAlternate: modello.righeAlternate,
    numerazione: modello.numerazione,
  };
}
