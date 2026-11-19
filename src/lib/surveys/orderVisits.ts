import type { SurveyRow } from "@/types/surveys";
import type { AppointmentData } from "@/components/appointments/AppointmentDialog";

export const VISIT_GROUPS = [
  ["tutti", "Tutti"], ["da_fissare", "Da fissare"], ["fissati", "Fissati"],
  ["in_corso", "In corso"], ["effettuati", "Effettuati"], ["annullati", "Annullati"], ["archiviati", "Archiviati"],
] as const;
export type VisitGroup = typeof VISIT_GROUPS[number][0];
export interface OrderSurveyContext {
  orderId: string;
  orderCode?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  address?: string | null;
  appointment?: AppointmentData;
}
export interface OrderVisit {
  id: string;
  code: string;
  group: Exclude<VisitGroup, "tutti">;
  survey?: SurveyRow;
  appointment?: AppointmentData;
  when: string | null;
  address: string;
  technicianId: string | null;
}
const VISIT_TYPES = new Set(["sopralluogo", "sopralluogo_preventivo", "rilievo_tecnico", "misurazione", "verifica_cantiere"]);
const DONE = new Set(["completed", "reviewed", "signed", "converted"]);
export function orderVisits(surveys: SurveyRow[], appointments: AppointmentData[]): OrderVisit[] {
  const byId = new Map(appointments.filter(a => a.id).map(a => [a.id!, a]));
  const linked = new Set(surveys.map(s => s.appointment_id).filter(Boolean));
  const fromAppointment = (a?: AppointmentData) => a?.appointment_date ? a.appointment_time ? `${a.appointment_date}T${a.appointment_time}` : a.appointment_date : null;
  const cancelled = (a?: AppointmentData) => /annull|cancel/i.test(a?.status || "");
  const rows: OrderVisit[] = surveys.map(s => {
    const address = s.address?.trim() || "", city = s.city?.trim() || "";
    const appointment = s.appointment_id ? byId.get(s.appointment_id) : undefined;
    const group = s.status === "archived" ? "archiviati" : DONE.has(s.status) ? "effettuati"
      : s.status === "cancelled" || cancelled(appointment) ? "annullati" : s.status === "in_progress" ? "in_corso"
      : appointment?.is_completed ? "effettuati" : s.scheduled_at || appointment?.appointment_date ? "fissati" : "da_fissare";
    return {id:`survey:${s.id}`,code:s.code || "Sopralluogo",survey:s,appointment,group,
      when:fromAppointment(appointment) || s.scheduled_at || null,
      address:[address,city && !address.toLocaleLowerCase("it").endsWith(city.toLocaleLowerCase("it")) ? city : ""].filter(Boolean).join(", "),technicianId:appointment ? appointment.assigned_to : s.technician_id};
  });
  for (const appointment of appointments) {
    if (!appointment.id || linked.has(appointment.id) || !VISIT_TYPES.has(appointment.appointment_type)) continue;
    rows.push({id:`appointment:${appointment.id}`,code:appointment.title || "Sopralluogo",appointment,
      group:cancelled(appointment) ? "annullati" : appointment.is_completed ? "effettuati" : "fissati",
      when:fromAppointment(appointment),address:appointment.formatted_address || [appointment.address_line,appointment.address_city].filter(Boolean).join(", "),technicianId:appointment.assigned_to});
  }
  return rows.sort((a,b) => String(b.when || b.survey?.created_at || "").localeCompare(String(a.when || a.survey?.created_at || "")) || a.id.localeCompare(b.id));
}
