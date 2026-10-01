/**
 * I colori delle azioni in «Lavori e squadre» (26/09/2026, richiesta del
 * founder: «bottoni con colori»). Ogni cosa ha il suo colore, uguale ovunque:
 * in alto nella commessa e dentro ogni fase.
 *   fase    → azzurro
 *   squadra → arancio
 *   persona → viola (persona o ditta)
 *   nota    → ambra
 *   mezzo   → verde acqua (mezzi e attrezzi)
 * «piena» per i bottoni principali in cima, «tenue» per quelli dentro le fasi.
 */
export const AZIONE_PIENA = {
  fase: "border-transparent bg-sky-600 text-white shadow-sm hover:bg-sky-700 hover:text-white",
  squadra: "border-transparent bg-orange-500 text-white shadow-sm hover:bg-orange-600 hover:text-white",
  persona: "border-transparent bg-violet-600 text-white shadow-sm hover:bg-violet-700 hover:text-white",
  nota: "border-transparent bg-amber-500 text-white shadow-sm hover:bg-amber-600 hover:text-white",
  mezzo: "border-transparent bg-teal-600 text-white shadow-sm hover:bg-teal-700 hover:text-white",
} as const;

export const AZIONE_TENUE = {
  fase: "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 hover:text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  squadra: "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100 hover:text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  persona: "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 hover:text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  nota: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  mezzo: "border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 hover:text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200",
} as const;
