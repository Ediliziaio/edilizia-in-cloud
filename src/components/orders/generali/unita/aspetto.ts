// src/components/orders/generali/unita/aspetto.ts
// Colori degli stati di vendita e formati dei numeri, uguali in tabellone, tabella e riquadro.
// I colori sono quelli dei tabelloni di cantiere: verde libera, giallo prenotata, arancio
// compromesso, rosso rogitata (venduta).
import { leggiImporto } from "@/lib/controlloGestione/formatCG";
import { formattaEuro } from "@/lib/orders/commesseGenerali";
import type { StatoVendita } from "@/lib/orders/generali/unita";

export const STILE_STATO: Record<StatoVendita, { casella: string; punto: string; scelto: string }> = {
  libera: {
    casella: "border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-50 dark:hover:bg-emerald-500/20",
    punto: "bg-emerald-500",
    scelto: "border-emerald-500 bg-emerald-500 text-white",
  },
  prenotata: {
    casella: "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50 dark:hover:bg-amber-500/20",
    punto: "bg-amber-400",
    scelto: "border-amber-400 bg-amber-400 text-amber-950",
  },
  compromesso: {
    casella: "border-orange-300 bg-orange-50 text-orange-950 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-50 dark:hover:bg-orange-500/20",
    punto: "bg-orange-500",
    scelto: "border-orange-500 bg-orange-500 text-white",
  },
  rogitata: {
    casella: "border-rose-300 bg-rose-50 text-rose-950 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-50 dark:hover:bg-rose-500/20",
    punto: "bg-rose-500",
    scelto: "border-rose-500 bg-rose-500 text-white",
  },
};

export const euro = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formattaEuro(n));

/** Nelle caselle: 245k €, 1,2 M€. */
export function euroBreve(n: number | null): string {
  if (n === null) return "";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} M€`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k €`;
  return formattaEuro(n);
}

/** «2026-10-30» → «30/10/2026». */
export const dataBreve = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

/** Oggi in ora locale, per i campi data. */
export function oggi(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Un importo da un campo: vuoto = null, scritto male = NaN. */
export function leggiCampo(testo: string): number | null {
  if (testo.trim() === "") return null;
  const n = leggiImporto(testo);
  return n === null ? NaN : n;
}

/** Un numero già salvato dentro un campo da modificare: «250000» → «250000», 95.5 → «95,5». */
export const inCampo = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
