/**
 * Un solo disegno per le schede e i filtri a pillola da telefono (decisione del founder,
 * 23/11/2026: «dove è tondo, dove è quadrato… non è omogeneo; mi piace di più il tondo»).
 * Pillola alta 36px, bordo sottile, attiva arancio chiaro; i bottoni accanto alla riga
 * (⋯, +) sono tondi e alti uguali.
 */
export const RIGA_PILLOLE = "flex min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
export const PILLOLA = "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const PILLOLA_ATTIVA = "border-orange-200 bg-orange-50 text-orange-700";
export const PILLOLA_SPENTA = "border-border bg-background text-muted-foreground hover:text-foreground";
/** Per i trigger Radix (Tabs): lo stato attivo arriva da data-state. */
export const PILLOLA_TAB = `${PILLOLA} ${PILLOLA_SPENTA} data-[state=active]:border-orange-200 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 data-[state=active]:shadow-none`;
/** Bottone tondo accanto alla riga di pillole (⋯ o +). */
export const BOTTONE_TONDO = "h-9 w-9 shrink-0 rounded-full p-0";
