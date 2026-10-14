/** Shared read rules for the commessa's dates and its real appointments. */
export interface OrderPlanningDates {
  expected_date: string | null;
  warehouse_arrival_date: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
}

export function isPlanningDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return year >= 1900 && year <= 9999 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function planningDay(value?: string | null): string {
  const day = value?.slice(0, 10) ?? "";
  return isPlanningDay(day) ? day : "";
}

export function planningTime(value?: string | null): string {
  const time = value?.slice(0, 5) ?? "";
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
}

/** Validate the whole interval before writing any date or calling integrations. */
export function validatePlanning(dates: OrderPlanningDates): string | null {
  for (const field of ["expected_date", "warehouse_arrival_date", "work_start_date", "work_end_date"] as const)
    if (dates[field] && !isPlanningDay(dates[field]!)) return "Indica date valide.";
  if (dates.work_start_date && dates.work_end_date && dates.work_end_date < dates.work_start_date)
    return "La fine lavori non può essere prima dell'inizio.";
  if ((dates.work_start_time && !dates.work_start_date) || (dates.work_end_time && !dates.work_end_date))
    return "Imposta la data prima dell'orario.";
  if ((dates.work_start_time && !planningTime(dates.work_start_time)) || (dates.work_end_time && !planningTime(dates.work_end_time)))
    return "Indica orari validi.";
  if (dates.work_start_date && dates.work_start_date === dates.work_end_date && dates.work_start_time && dates.work_end_time && dates.work_end_time <= dates.work_start_time)
    return "Nello stesso giorno, l'orario di fine deve seguire quello di inizio.";
  return null;
}

export interface PlanningAppointment {
  appointment_date: string;
  appointment_time?: string | null;
  appointment_type?: string | null;
  description?: string | null;
  assigned_to?: string | null;
  calendar_id?: string | null;
  is_completed?: boolean | null;
  status?: string | null;
}

/** Old auto-generated markers aren't a second real appointment or a staff shift. */
export function isLegacyPlanningMarker(appointment: PlanningAppointment): boolean {
  return !appointment.assigned_to && !appointment.calendar_id && !appointment.appointment_time &&
    ((appointment.appointment_type === "inizio_lavori" && appointment.description === "Milestone operativo di avvio lavori collegato alla commessa.") ||
     (appointment.appointment_type === "fine_lavori" && appointment.description === "Milestone operativo di fine lavori collegato alla commessa."));
}

export function isArchivedAppointment(appointment: PlanningAppointment): boolean {
  return !!appointment.is_completed || appointment.status === "annullato" || isLegacyPlanningMarker(appointment);
}

export function comparePlanningAppointments(a: PlanningAppointment, b: PlanningAppointment): number {
  return `${planningDay(a.appointment_date) || "9999-12-31"}T${planningTime(a.appointment_time)}`
    .localeCompare(`${planningDay(b.appointment_date) || "9999-12-31"}T${planningTime(b.appointment_time)}`);
}

export const APPOINTMENT_LABELS: Record<string, string> = {
  sopralluogo: "Sopralluogo", sopralluogo_preventivo: "Sopralluogo", rilievo_tecnico: "Rilievo tecnico",
  misurazione: "Misurazione", verifica_cantiere: "Verifica cantiere", conferma_ordine: "Conferma ordine",
  inizio_lavori: "Inizio lavori", fine_lavori: "Fine lavori", posa_prova: "Posa di prova", collaudo: "Collaudo",
  consegna: "Consegna", assistenza: "Assistenza", manutenzione: "Manutenzione", ispezione: "Ispezione",
  riunione: "Riunione", cliente: "Cliente", generico: "Generico",
};
