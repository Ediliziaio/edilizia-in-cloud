import { differenceInCalendarDays, parseISO, isValid } from "date-fns";
export type BaseCostoMezzo = "totale" | "giorno" | "settimana" | "mese";
export interface CostoPianoMezzo {
  tariffa: number;
  base: BaseCostoMezzo;
  extra: number;
  fornitore: string | null;
  supplier_id?: string | null;
}
export interface PianoMezzo {
  id: string;
  company_id: string;
  order_id: string;
  mezzo_id: string;
  fase_ids: string[];
  responsabile_hr_id?: string | null;
  dal: string;
  al: string | null;
  quantita: number;
  note: string | null;
  annullato: boolean;
}
export function costoPianoMezzo(
  p: Pick<PianoMezzo, "dal" | "al">,
  c: CostoPianoMezzo,
): number | null {
  if (c.base === "totale") return Math.round((c.tariffa + c.extra) * 100) / 100;
  if (!p.al || !isValid(parseISO(p.dal)) || !isValid(parseISO(p.al)))
    return null;
  const giorni = differenceInCalendarDays(parseISO(p.al), parseISO(p.dal)) + 1;
  if (giorni <= 0) return null;
  // Tariffa dell'assegnazione, non per pezzo; settimana e mese sono pro-rata.
  return (
    Math.round(
      ((c.tariffa * giorni) / { giorno: 1, settimana: 7, mese: 30 }[c.base] +
        c.extra) *
        100,
    ) / 100
  );
}
export function statoPianoMezzo(
  p: Pick<PianoMezzo, "annullato" | "dal" | "al">,
  oggi: string,
) {
  return p.annullato
    ? "Annullato"
    : p.dal > oggi
      ? "Programmato"
      : p.al && p.al < oggi
        ? "Terminato"
        : "Nel periodo previsto";
}
export function pianoPerFase(p: Pick<PianoMezzo, "fase_ids">, faseId?: string) {
  return !faseId || p.fase_ids.length === 0 || p.fase_ids.includes(faseId);
}
