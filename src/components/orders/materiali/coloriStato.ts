/**
 * I colori dei passi dello stato di un materiale: gli stessi nella vista per
 * fase del dettaglio e nell'elenco della nuova commessa.
 */
import type { StatoMateriale } from "@/lib/distinta/statoMateriale";

/** La pillola: bordo, fondo e testo. */
export const COLORE_STATO: Record<StatoMateriale, string> = {
  da_ordinare: "border-border bg-muted text-muted-foreground",
  in_offerta: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  in_bozza_oda: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  ordinato: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  consegnato: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  installato: "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-700",
};

/** Il colore pieno dello stato: barrette delle righe, barra delle fasi, pallini dei filtri. */
export const COLORE_BARRA: Record<StatoMateriale, string> = {
  da_ordinare: "bg-slate-300 dark:bg-slate-600",
  in_offerta: "bg-amber-300 dark:bg-amber-600",
  in_bozza_oda: "bg-amber-400 dark:bg-amber-500",
  ordinato: "bg-sky-500",
  consegnato: "bg-emerald-400 dark:bg-emerald-500",
  installato: "bg-emerald-600 dark:bg-emerald-400",
};
