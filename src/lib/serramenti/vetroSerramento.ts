/**
 * Il vetro di un serramento nel disegno: come si riconosce dalle scelte del listino
 * («Vetro Antisonoro», «Triplo vetro stratificato», «satinato») e che cosa cambia
 * nel disegno: la tinta del vetro e il numero di lastre (i distanziatori che si
 * vedono lungo il bordo: uno per il doppio vetro, due per il triplo).
 */
export type TipoVetro = "standard" | "satinato" | "fume" | "bronzo" | "opaco" | "riflettente" | "serigrafato" | "acustico" | "antisfondamento";

export interface VetroDisegno {
  tipo?: TipoVetro;
  /** Numero di lastre: 2 = doppio vetro, 3 = triplo vetro. */
  lastre?: 2 | 3;
}

function chiave(testo: string): string {
  return testo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Dalle etichette delle scelte (tipologia del vetro, vetrocamera, finitura): il tipo e le lastre. */
export function vetroDaEtichette(...etichette: Array<string | null | undefined>): VetroDisegno {
  const k = etichette.filter(Boolean).map((e) => chiave(e as string)).join(" | ");
  let tipo: TipoVetro = "standard";
  if (/satinat/.test(k)) tipo = "satinato";
  else if (/fume/.test(k)) tipo = "fume";
  else if (/bronz/.test(k)) tipo = "bronzo";
  else if (/opac|latte/.test(k)) tipo = "opaco";
  else if (/riflett|selettiv|solare/.test(k)) tipo = "riflettente";
  else if (/serigraf|cattedral|mastercarr|decorativ/.test(k)) tipo = "serigrafato";
  else if (/antisonor|acustic|fonoisol/.test(k)) tipo = "acustico";
  else if (/antisfond|antieffraz|sicurezza/.test(k)) tipo = "antisfondamento";
  const lastre: 2 | 3 = /triplo|3 vetri|tre vetri/.test(k) ? 3 : 2;
  return { tipo, lastre };
}
