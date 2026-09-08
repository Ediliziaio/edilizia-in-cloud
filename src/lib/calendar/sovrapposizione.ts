/**
 * Intervalli di lavoro e sovrapposizione. Pure, senza dipendenze: le usa la
 * striscia di disponibilità della squadra e le testa vitest.
 *
 * Una commessa senza orari occupa tutta la giornata (00:00 → 23:59 dell'ultimo
 * giorno); con gli orari occupa solo quelle ore, così due mezze giornate della
 * stessa squadra non si pestano.
 */
export interface Intervallo {
  inizio: Date;
  fine: Date;
}

export function intervalloCommessa(o: {
  work_start_date: string | null;
  work_end_date: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
}): Intervallo | null {
  if (!o.work_start_date) return null;
  const fineGiorno = o.work_end_date && o.work_end_date >= o.work_start_date ? o.work_end_date : o.work_start_date;
  const conOrari = !!o.work_start_time && !!o.work_end_time;
  const oraInizio = conOrari ? o.work_start_time!.slice(0, 5) : "00:00";
  const oraFine = conOrari ? o.work_end_time!.slice(0, 5) : "23:59";
  return {
    inizio: new Date(`${o.work_start_date}T${oraInizio}:00`),
    fine: new Date(`${fineGiorno}T${oraFine}:00`),
  };
}

export function siSovrappongono(a: Intervallo, b: Intervallo): boolean {
  return a.inizio < b.fine && a.fine > b.inizio;
}
