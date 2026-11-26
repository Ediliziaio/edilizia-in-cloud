/**
 * Geometria del calendario del giorno (vista Giorno della Programmazione):
 * dalle 6 alle 21, 56 px all'ora. Qui solo i conti, per poterli provare.
 */
import { spostaOrario, type Intervento } from "@/lib/programmazione/giornata";

export const DALLE = 6;
export const ALLE = 21;
export const PX_ORA = 56;
export const PX_MIN = PX_ORA / 60;
export const ID_GRIGLIA = "griglia-giorno";

export const minuti = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
export const oraDa = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/**
 * Dove finisce un blocco trascinato. Con orario: si sposta di quanto l'hai
 * mosso (passi di 15 minuti). Senza orario, lasciato nella griglia: l'ora è
 * dove sta il puntatore, durata un'ora. Fuori dalla griglia: niente.
 */
export function orarioDopoTrascinamento(
  i: Intervento,
  deltaY: number,
  puntatoreY: number | null,
  grigliaTop: number | null,
  sullaGriglia: boolean,
): Pick<Intervento, "inizio" | "fine" | "momento"> | null {
  if (i.inizio) {
    if (Math.abs(deltaY) < 3) return null;
    return { ...spostaOrario(i, deltaY / PX_MIN), momento: null };
  }
  if (!sullaGriglia || puntatoreY == null || grigliaTop == null) return null;
  const m = Math.floor(((puntatoreY - grigliaTop) / PX_MIN + DALLE * 60) / 15) * 15;
  const inizio = oraDa(Math.min(Math.max(m, DALLE * 60), (ALLE - 1) * 60));
  return { inizio, fine: oraDa(minuti(inizio) + 60), momento: null };
}
