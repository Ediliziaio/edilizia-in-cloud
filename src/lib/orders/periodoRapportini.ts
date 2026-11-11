import { format, parseISO, subDays } from "date-fns";
import { giorniDelMese, meseValido } from "./rapportiniMese";

export interface IntervalloRapportini {
  da?: string;
  a?: string;
}
export type PeriodoRapportini =
  | "tutti"
  | "mese"
  | "ultimi30"
  | "anno"
  | "personalizzato";
export function dataRapportiniValida(s: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(parseISO(s).valueOf()) &&
    format(parseISO(s), "yyyy-MM-dd") === s
  );
}
export function intervalloRapportini(
  tipo: PeriodoRapportini,
  oggi: string,
  mese: string,
  da = "",
  a = "",
): IntervalloRapportini | null {
  if (tipo === "tutti") return {};
  if (tipo === "ultimi30")
    return { da: format(subDays(parseISO(oggi), 29), "yyyy-MM-dd"), a: oggi };
  if (tipo === "anno") return { da: `${oggi.slice(0, 4)}-01-01`, a: oggi };
  if (tipo === "mese") {
    if (!meseValido(mese)) return null;
    const giorni = giorniDelMese(mese);
    return { da: giorni[0], a: giorni.at(-1)! };
  }
  return dataRapportiniValida(da) && dataRapportiniValida(a) && da <= a
    ? { da, a }
    : null;
}
export function etichettaPeriodoRapportini(
  intervallo: IntervalloRapportini,
): string {
  return intervallo.da && intervallo.a
    ? `${format(parseISO(intervallo.da), "dd/MM/yyyy")} – ${format(parseISO(intervallo.a), "dd/MM/yyyy")}`
    : "Tutto il periodo";
}
