// src/components/orders/generali/piano/formato.ts
// Come si scrivono i numeri del piano economico, e i colori delle tre colonne
// (piano §3.1 punto 3: Previsto · Reale · A finire, stessi colori in ogni schermata).
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";
import type { TipoVoce } from "@/lib/orders/generali/pianoCategorie";

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const NUMERO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

/** Euro senza centesimi; «—» quando il numero non c'è. */
export const euro = (n: number | null | undefined) => (n === null || n === undefined ? "—" : EURO.format(n));

/** Con il segno davanti: «+12.000 €», «−3.500 €». */
export const euroSegno = (n: number) => `${n > 0.5 ? "+" : n < -0.5 ? "−" : ""}${EURO.format(Math.abs(n))}`;

/** Il numero da modificare in una cella: «1250000,5». */
export const testoNumero = (n: number | null | undefined) => (n === null || n === undefined ? "" : NUMERO.format(n).replace(/\./g, ""));

/** 0.183 → «18,3%». */
export const percento = (n: number | null | undefined, decimali = 1) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : `${(n * 100).toLocaleString("it-IT", { maximumFractionDigits: decimali, minimumFractionDigits: 0 })}%`;

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
/** «2027-03» → «mar 2027». */
export const nomeMese = (mese: string | null | undefined) =>
  mese && /^\d{4}-\d{2}/.test(mese) ? `${MESI[Number(mese.slice(5, 7)) - 1]} ${mese.slice(0, 4)}` : "—";
/** «2027-03» → «03/2027» (come si scrive in una cella). */
export const testoMese = (mese: string | null | undefined) => (mese && /^\d{4}-\d{2}/.test(mese) ? `${mese.slice(5, 7)}/${mese.slice(0, 4)}` : "");

export const dataBreve = (d: string | null | undefined) =>
  d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";

/** I colori delle colonne: un pallino nell'intestazione e il colore dei numeri. */
export const TONI = {
  previsto: { punto: "bg-slate-400", testo: "" },
  reale: { punto: "bg-sky-600", testo: "text-sky-800 dark:text-sky-300" },
  aFinire: { punto: "bg-amber-500", testo: "text-amber-800 dark:text-amber-300" },
  stima: { punto: "bg-foreground", testo: "font-medium" },
} as const;

/** Lo scostamento è buono o cattivo secondo cosa misura: più costi è male, più ricavi o margine è bene. */
export function tonoScostamento(n: number, tipo: TipoVoce | "margine"): string {
  if (Math.abs(n) < 0.5) return "text-muted-foreground";
  const bene = tipo === "costo" ? n < 0 : n > 0;
  return bene ? "text-emerald-700 dark:text-emerald-400" : "text-destructive";
}

/** Come si chiama il piano nel modello: per l'appalto è il budget, per lo sviluppo il business plan. */
export const nomePiano = (modello: ModelloGenerale) => (modello === "appalto" ? "il budget dell'appalto" : "il business plan");
