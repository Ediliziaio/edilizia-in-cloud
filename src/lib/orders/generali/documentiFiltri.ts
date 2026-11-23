import type { CasellaDocumento } from "./documenti";
export type FiltroDocumenti =
  | "tutti"
  | "presenti"
  | "mancanti"
  | "in_scadenza"
  | "scaduti"
  | "senza_data";
export function documentoNelFiltro(
  c: CasellaDocumento,
  filtro: FiltroDocumenti,
) {
  if (filtro === "tutti") return true;
  if (filtro === "presenti")
    return (
      c.obbligatoria && (c.stato === "presente" || c.stato === "in_scadenza")
    );
  if (filtro === "mancanti") return c.obbligatoria && c.stato === "mancante";
  if (filtro === "senza_data") return c.senzaData;
  return c.stato === (filtro === "scaduti" ? "scaduto" : "in_scadenza");
}
