import type { CalendarAppointment } from "@/types/calendar";

/**
 * Nel calendario dei lavori un appuntamento commerciale (senza commessa) di un
 * collega è un impegno, non un'informazione da leggere: chi non ha il permesso
 * di vedere gli appuntamenti del CRM sa che quella persona è occupata, non con
 * chi né dove. Restano visibili i propri appuntamenti e quelli di una commessa.
 */
export function appuntamentoRiservato(
  apt: CalendarAppointment,
  userId: string | null | undefined,
): boolean {
  if (apt.order_id) return false;
  if (userId && (apt.assigned_to === userId || apt.created_by === userId)) return false;
  return true;
}

export function mascheraAppuntamentoRiservato(apt: CalendarAppointment): CalendarAppointment {
  return {
    id: apt.id,
    title: "Occupato",
    description: null,
    appointment_date: apt.appointment_date,
    appointment_time: apt.appointment_time,
    appointment_end_time: apt.appointment_end_time ?? null,
    appointment_type: apt.appointment_type,
    assigned_to: apt.assigned_to,
    order_id: null,
    calendar_id: apt.calendar_id ?? null,
    is_completed: apt.is_completed,
    company_id: apt.company_id,
    created_by: apt.created_by,
    status: apt.status,
    contact: null,
    order: null,
    riservato: true,
  };
}

export function appuntamentiPerCalendarioLavori(
  rows: CalendarAppointment[],
  opts: { userId: string | null | undefined; vedeCrm: boolean },
): CalendarAppointment[] {
  if (opts.vedeCrm) return rows;
  return rows.map((a) => (appuntamentoRiservato(a, opts.userId) ? mascheraAppuntamentoRiservato(a) : a));
}
