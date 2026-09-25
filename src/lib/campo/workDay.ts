/** A field workday follows Italian civil time, independent of the phone zone. */
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
});
export function campoWorkDay(now = new Date()): string {
  const parts = dayFormatter.formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function validWorkDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}
export function shiftWorkDay(day: string, days: number): string {
  if (!validWorkDay(day)) throw new Error("Data del rapportino non valida");
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function reportDayAllowed(day: string, now = new Date()): boolean {
  if (!validWorkDay(day)) return false;
  const today = campoWorkDay(now);
  return day === today || day === shiftWorkDay(today, -1);
}
export const REPORT_DEADLINE_MESSAGE = "Il rapportino va inviato entro il giorno successivo al lavoro (ore 23:59, ora italiana). Per giornate precedenti contatta l’ufficio.";
export function assertReportDay(day: string, now = new Date()): void {
  if (!reportDayAllowed(day, now)) throw new Error(REPORT_DEADLINE_MESSAGE);
}

/** Midnight in Rome; recompute the offset at the boundary for DST days. */
export function workDayStart(day: string): Date {
  if (!validWorkDay(day)) throw new Error("Data del rapportino non valida");
  const target = Date.parse(`${day}T00:00:00Z`);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(instant));
    const value = (type: string) => parts.find(p => p.type === type)!.value;
    const localAsUTC = Date.parse(`${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}Z`);
    instant += target - localAsUTC;
  }
  return new Date(instant);
}
