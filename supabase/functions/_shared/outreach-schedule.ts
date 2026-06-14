/**
 * outreach-schedule — finestra di invio PURA (niente Deno/Supabase, solo Intl).
 * Il cold parte solo in orari "umani" (default Lun-Ven 8-19 Europe/Rome):
 * niente invii di notte o nel weekend → meno spam, più risposte. Testato in vitest.
 */

export interface SendWindow {
  days: number[];     // 0=Dom, 1=Lun, … 6=Sab
  startHour: number;  // incluso
  endHour: number;    // escluso
  timeZone: string;
}

export const DEFAULT_SEND_WINDOW: SendWindow = {
  days: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 19,
  timeZone: "Europe/Rome",
};

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Ora (0-23) e giorno settimana (0-6) di un istante in un fuso, via Intl (gestisce la DST). */
export function localParts(date: Date, timeZone: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(date);
  let hour = 0, weekday = 0;
  for (const p of parts) {
    if (p.type === "hour") hour = parseInt(p.value, 10) % 24;
    else if (p.type === "weekday") weekday = WEEKDAY[p.value] ?? 0;
  }
  return { hour, weekday };
}

/** True se l'istante cade nella finestra (giorno consentito e ora tra start e end). */
export function isWithinSendWindow(date: Date, w: SendWindow = DEFAULT_SEND_WINDOW): boolean {
  const { hour, weekday } = localParts(date, w.timeZone);
  if (!w.days.includes(weekday)) return false;
  return hour >= w.startHour && hour < w.endHour;
}
