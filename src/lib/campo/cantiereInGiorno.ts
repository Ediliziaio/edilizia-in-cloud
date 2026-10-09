import { isToday, isWithinInterval, parseISO, startOfDay } from "date-fns";

/**
 * Un cantiere compare in un giorno del calendario «Lavori»?
 *
 * Si confrontano GIORNI, non istanti: `parseISO("2026-10-06")` è la mezzanotte, e «oggi» alle 15:00 sta DOPO la
 * mezzanotte dell'ultimo giorno del lavoro — senza `startOfDay` l'ultimo giorno spariva da «Oggi» proprio
 * mentre lo si stava lavorando (e tornava toccando il giorno nella striscia, che è già a mezzanotte).
 *
 * Ordine delle regole:
 *   1. le date personali di chi guarda (`mio`, se c'è una risposta) vincono su tutto;
 *   2. con inizio e fine: dentro l'intervallo; oltre la fine ma ancora aperto = in ritardo, non finito, e resta
 *      visibile su OGGI (la Home lo conta ancora tra i cantieri attivi: le due schermate non devono contraddirsi);
 *   3. solo l'inizio: da quel giorno in poi;
 *   4. nessuna data: sempre.
 */
export function cantiereCadeInGiorno(i: {
  giorno: Date;
  inizio?: string | null;
  fine?: string | null;
  mio: boolean | null;
  /** Funzione e non valore: si valuta solo se serve (solo per «oggi», oltre la data di fine). */
  inRitardoAperto: () => boolean;
}): boolean {
  if (i.mio !== null) return i.mio;
  const giorno = startOfDay(i.giorno);
  if (i.inizio && i.fine) {
    if (isWithinInterval(giorno, { start: parseISO(i.inizio), end: parseISO(i.fine) })) return true;
    return isToday(giorno) && i.inRitardoAperto();
  }
  if (i.inizio) return parseISO(i.inizio) <= giorno;
  return true;
}
