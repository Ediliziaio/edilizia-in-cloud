import { differenceInCalendarDays } from "date-fns";
import { commessaChiusa } from "./cantieriAperti";

/**
 * Giorni di ritardo di un cantiere: fine prevista passata e commessa non chiusa. null se non è in ritardo.
 * Collaudo 23/11/2026: ORD-DEM-RIS01 doveva finire il 16 ago ed era al 45%, ma né la Home né la pagina del lavoro
 * lo dicevano. Regola del founder: i ritardi si vedono sempre.
 */
export function giorniRitardoCantiere(fine: string | null | undefined, oggi: string, stato: string | null | undefined): number | null {
  const giorno = fine?.slice(0, 10);
  if (!giorno || giorno >= oggi || commessaChiusa(stato)) return null;
  return differenceInCalendarDays(new Date(`${oggi}T12:00:00`), new Date(`${giorno}T12:00:00`));
}

export const testoRitardoCantiere = (giorni: number) => `in ritardo di ${giorni} ${giorni === 1 ? "giorno" : "giorni"}`;
