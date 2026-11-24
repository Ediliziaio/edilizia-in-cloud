/**
 * Forme e testi comuni dell'area operai (collaudo 23/11/2026: «stesse forme, stessi testi»).
 *
 * Bottoni a pillola come la barra in basso e le schede; testi su una scala sola:
 * 17 titolo di pagina · 15 titolo di riquadro · 14 testo e bottoni · 13 bottoni piccoli · 12 note · 11 etichette.
 */
export const PILLOLA = "inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-full border bg-background px-4 text-sm font-semibold text-foreground active:bg-muted";
export const PILLOLA_TENUE = "inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-4 text-sm font-semibold text-primary active:bg-primary/15";
export const PILLOLA_PICCOLA = "inline-flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-full border bg-background px-3 text-[13px] font-semibold text-foreground active:bg-muted";
/** Etichetta di ruolo o di stato: «Capocantiere», «Caposquadra», «In corso». */
export const CHIP = "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold";
export const RIQUADRO = "rounded-2xl border bg-background p-3 shadow-sm";
export const TITOLO_RIQUADRO = "text-[15px] font-bold leading-snug";
