/**
 * Articoli «a zero» da tenere fuori dall'elenco delle giacenze finché non si chiedono
 * (decisione del founder, 23/11/2026): un magazzino vero accumula articoli finiti, lotti
 * vecchi, codici doppi, e l'elenco diventa una lista di zeri.
 *
 * A zero vuol dire: niente giacenza, niente impegni, niente in arrivo e nessuna scorta
 * minima. Un articolo con la scorta minima impostata resta visibile anche a zero, perché è
 * proprio quello da riordinare.
 */
export interface ArticoloPerZero {
  id: string;
  quantity: number | string | null;
  quantity_reserved?: number | string | null;
  min_stock_level?: number | string | null;
}

export function eArticoloAZero(articolo: ArticoloPerZero, inArrivo?: { get(id: string): unknown }): boolean {
  return (
    Number(articolo.quantity ?? 0) === 0 &&
    Number(articolo.quantity_reserved ?? 0) === 0 &&
    !(Number(articolo.min_stock_level ?? 0) > 0) &&
    !inArrivo?.get(articolo.id)
  );
}

/** Separa gli articoli da mostrare da quelli a zero. Con `attivo` falso non nasconde niente. */
export function separaArticoliAZero<T extends ArticoloPerZero>(
  articoli: T[],
  attivo: boolean,
  inArrivo?: { get(id: string): unknown },
): { visibili: T[]; nascosti: number } {
  if (!attivo) return { visibili: articoli, nascosti: 0 };
  const visibili = articoli.filter((a) => !eArticoloAZero(a, inArrivo));
  return { visibili, nascosti: articoli.length - visibili.length };
}

export const CHIAVE_MOSTRA_A_ZERO = "eic:magazzino-mostra-a-zero";
