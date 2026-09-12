/**
 * Come si scrive una maggiorazione di variante accanto al suo valore.
 *
 * Il segno lo porta già il numero: una linea che costa meno (es. −8%) ha
 * valore negativo. Scrivere "+" a mano davanti produceva "+-8%", che è il
 * modo più rapido per far dubitare del prezzo chi legge.
 */
export type MaggiorazioneTipo =
  | "none"
  | "percentuale"
  | "fisso_pz"
  | "fisso_mq"
  | "fisso_ml"
  | "fisso_mc";

const UNITA: Record<string, string> = {
  fisso_pz: "€/pz",
  fisso_mq: "€/m²",
  fisso_ml: "€/ml",
  fisso_mc: "€/m³",
};

/** "+15%", "−8%", "+40€/m²". Stringa vuota se non c'è maggiorazione. */
export function formattaMaggiorazione(tipo: string | null | undefined, valore: number | null | undefined): string {
  const v = Number(valore ?? 0);
  if (!tipo || tipo === "none" || v === 0) return "";
  const segno = v > 0 ? "+" : "−";
  const modulo = Math.abs(v);
  if (tipo === "percentuale") return `${segno}${modulo}%`;
  const unita = UNITA[tipo];
  return unita ? `${segno}${modulo}${unita}` : "";
}

/** Come sopra ma fra parentesi e con lo spazio davanti: " (−8%)". Vuoto se non serve. */
export function suffissoMaggiorazione(tipo: string | null | undefined, valore: number | null | undefined): string {
  const testo = formattaMaggiorazione(tipo, valore);
  return testo ? ` (${testo})` : "";
}
