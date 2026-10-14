import { format, parseISO } from "date-fns";
import { etichettaCommessa } from "@/lib/calendarUtils";
import { campoWorkDay } from "@/lib/campo/workDay";
import type { CalendarEvent } from "./events";
import { ticketStatoLabel } from "@/types/tickets";

export const calendarEventKey = (event: CalendarEvent) =>
  `${event.type}:${event.order?.id || event.appointment?.id || event.busySlot?.id || event.leave?.id || event.intervento?.id || event.manutenzione?.id}:${event.work?.phase_id || ""}`;

export const calendarEventTime = (event: CalendarEvent) =>
  event.appointment?.appointment_time?.slice(0, 5) ||
  event.work?.start_time?.slice(0, 5) ||
  (event.busySlot && !event.busySlot.is_all_day
    ? format(parseISO(event.busySlot.start_at), "HH:mm")
    : event.intervento?.data_intervento_prevista?.includes("T")
      ? new Intl.DateTimeFormat("it-IT", {
          timeZone: "Europe/Rome",
          hour: "2-digit",
          minute: "2-digit",
        }).format(parseISO(event.intervento.data_intervento_prevista))
      : "");

export const calendarEventDate = (value: string) =>
  value.includes("T") ? campoWorkDay(parseISO(value)) : value.slice(0, 10);

export const calendarEventKind = (event: CalendarEvent) =>
  ({
    posa: "Posa",
    lavoro: event.work?.phase_id ? "Lavorazione" : "Cantiere",
    merce: "Arrivo merce",
    appointment: event.appointment?.order_id
      ? "Appuntamento operativo"
      : "Appuntamento",
    google_busy: "Calendario esterno",
    leave: "Assenza approvata",
    intervento: "Intervento",
    manutenzione: "Manutenzione",
  })[event.type];

export const calendarEventTitle = (event: CalendarEvent) => {
  if (event.appointment) return event.appointment.title || "Appuntamento";
  if (event.work) return event.work.name;
  if (event.order)
    return `${calendarEventKind(event)} · ${etichettaCommessa(event.order)}`;
  if (event.busySlot) return event.busySlot.summary || "Occupato";
  if (event.leave)
    return event.leave.type === "ferie" ? "Ferie" : "Permesso / assenza";
  return event.intervento?.subject || event.manutenzione?.titolo || "Evento";
};

export const calendarEventGroup = (event: CalendarEvent) =>
  event.appointment || event.busySlot
    ? "appointments"
    : event.order
      ? "work"
      : "other";

/** Solo le risorse effettivamente assegnate alla fase e al giorno consultato. */
export function calendarEventResources(event: CalendarEvent, dateKey: string) {
  const bookings = event.work?.resources ?? event.order?.resource_bookings;
  if (bookings !== undefined)
    return [
      ...new Set(
        bookings
          .filter((b) => b.start_date <= dateKey && b.end_date >= dateKey)
          .map((b) => b.resourceName)
          .filter(Boolean),
      ),
    ];
  return [
    ...new Set(
      [
        ...(event.order?.order_employees ?? []).map((e) =>
          [e.employee.first_name, e.employee.last_name]
            .filter(Boolean)
            .join(" "),
        ),
        ...(event.order?.order_external_teams ?? []).map(
          (t) => t.external_team.name,
        ),
      ].filter(Boolean),
    ),
  ];
}

export const calendarEventStatus = (event: CalendarEvent) => {
  if (event.appointment?.is_completed) return "Completato";
  if (event.intervento) return ticketStatoLabel(event.intervento.status);
  const status =
    event.work?.status ||
    event.appointment?.status ||
    event.intervento?.status ||
    event.manutenzione?.stato;
  if (event.leave) return "Approvata";
  return (
    (
      {
        da_iniziare: "Da iniziare",
        in_corso: "In corso",
        completata: "Completata",
        completed: "Completato",
        scheduled: "Programmato",
        confirmed: "Confermato",
        cancelled: "Annullato",
        attivo: "Attiva",
        inattivo: "Inattiva",
      } as Record<string, string>
    )[status ?? ""] ||
    status?.replaceAll("_", " ") ||
    event.order?.status?.name
  );
};
