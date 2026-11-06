import { addDays, format, parseISO } from "date-fns";
import type { CalendarAppointment, CalendarOrder } from "@/types/calendar";

function escapeIcal(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function toIcalDate(dateStr: string, timeStr?: string | null): string {
  if (timeStr) {
    // e.g. "2026-04-01" + "09:00:00" → "20260401T090000"
    const t = timeStr.replace(/:/g, "").slice(0, 6).padEnd(6, "0");
    return dateStr.replace(/-/g, "") + "T" + t;
  }
  return ";VALUE=DATE:" + dateStr.replace(/-/g, "");
}

function dtstamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function exportAppointmentsIcal(
  appointments: CalendarAppointment[],
  orders: CalendarOrder[],
  filename = "calendario-edilizia.ics"
) {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Edilizia in Cloud//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  // Appointments
  for (const apt of appointments) {
    const dtstart = toIcalDate(apt.appointment_date, apt.appointment_time);
    const hasTime = !!apt.appointment_time;
    const dtend = hasTime
      ? (() => {
          const start = new Date(`${apt.appointment_date}T${apt.appointment_time}`);
          const end = apt.appointment_end_time
            ? new Date(`${apt.appointment_date}T${apt.appointment_end_time}`)
            : new Date(start.getTime() + 60 * 60 * 1000);
          if (apt.appointment_end_time && end <= start) end.setDate(end.getDate() + 1);
          return format(end, "yyyyMMdd'T'HHmmss");
        })()
      : null;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:apt-${apt.id}@ediliziacloud`);
    lines.push(`DTSTAMP:${dtstamp()}`);
    if (hasTime && dtend) {
      lines.push(`DTSTART:${dtstart}`);
      lines.push(`DTEND:${dtend}`);
    } else {
      lines.push(`DTSTART${dtstart}`);
    }
    lines.push(`SUMMARY:${escapeIcal(apt.title)}`);
    const description = [apt.description, apt.is_completed ? "Completato in Edilizia in Cloud" : null].filter(Boolean).join("\n");
    if (description) lines.push(`DESCRIPTION:${escapeIcal(description)}`);
    // RFC 5545 §3.8.1.11: COMPLETED appartiene a VTODO, non a VEVENT.
    if (apt.is_completed) lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }

  // Orders — work_start_date as multi-day events
  for (const order of orders) {
    const dateStr = order.work_start_date || order.expected_date;
    if (!dateStr) continue;

    const endStr = order.work_end_date || dateStr;
    const title = [order.order_code, order.description, `${order.customer.first_name} ${order.customer.last_name}`]
      .filter(Boolean)
      .join(" — ");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:ord-${order.id}@ediliziacloud`);
    lines.push(`DTSTAMP:${dtstamp()}`);
    lines.push(`DTSTART;VALUE=DATE:${dateStr.replace(/-/g, "")}`);
    // DTEND for all-day is exclusive (day after last)
    const endExclusive = format(
      addDays(parseISO(endStr), 1),
      "yyyyMMdd"
    );
    lines.push(`DTEND;VALUE=DATE:${endExclusive}`);
    lines.push(`SUMMARY:${escapeIcal(title)}`);
    if (order.status?.name) lines.push(`DESCRIPTION:Stato: ${escapeIcal(order.status.name)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  const content = lines.join("\r\n");
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
