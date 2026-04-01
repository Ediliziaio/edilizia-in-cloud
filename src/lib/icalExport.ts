import { format } from "date-fns";
import type { CalendarAppointment, CalendarOrder } from "@/types/calendar";

function escapeIcal(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toIcalDate(dateStr: string, timeStr?: string | null): string {
  if (timeStr) {
    // e.g. "2026-04-01" + "09:00:00" → "20260401T090000"
    const t = timeStr.replace(/:/g, "").slice(0, 6);
    return dateStr.replace(/-/g, "") + "T" + t;
  }
  return ";VALUE=DATE:" + dateStr.replace(/-/g, "");
}

function dtstamp(): string {
  return format(new Date(), "yyyyMMdd") + "T" + format(new Date(), "HHmmss") + "Z";
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
    const durationMin = apt.duration_minutes ?? 60;
    const dtend = hasTime
      ? (() => {
          const [h, m] = (apt.appointment_time || "00:00").split(":").map(Number);
          const total = h * 60 + m + durationMin;
          const eh = Math.floor(total / 60);
          const em = total % 60;
          return apt.appointment_date.replace(/-/g, "") + "T" + String(eh).padStart(2, "0") + String(em).padStart(2, "0") + "00";
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
    if (apt.notes) lines.push(`DESCRIPTION:${escapeIcal(apt.notes)}`);
    if (apt.is_completed) lines.push("STATUS:COMPLETED");
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
      new Date(new Date(endStr).getTime() + 24 * 60 * 60 * 1000),
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
