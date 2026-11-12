import type { CasellaDocumento } from "./documenti";
export type FiltroDocumenti =
  | "tutti"
  | "presenti"
  | "mancanti"
  | "in_scadenza"
  | "scaduti";
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
  return c.stato === (filtro === "scaduti" ? "scaduto" : "in_scadenza");
}
