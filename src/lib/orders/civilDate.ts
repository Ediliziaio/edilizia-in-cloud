/** Civil dates, independent of process timezone and daylight-saving changes. */
export function civilDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Data civile non valida");
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new RangeError("Data civile non valida");
  return time / 86_400_000;
}

export function civilDate(day: number): string {
  if (!Number.isInteger(day)) throw new RangeError("Giorno civile non valido");
  const value = new Date(day * 86_400_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Data fuori intervallo");
  return value;
}

export interface DayCalendar { workingWeekdays: readonly number[]; holidays: readonly string[] }
export const MONDAY_FRIDAY: DayCalendar = { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] };

/** N days after/before the trigger; the trigger day is not counted. */
export function shiftCivilDays(date: string, days: number, calendar?: DayCalendar): string {
  let day = civilDay(date);
  if (!Number.isSafeInteger(days) || Math.abs(days) > 36_600) throw new RangeError("Durata in giorni non valida");
  if (!calendar) return civilDate(day + days);
  if (!calendar.workingWeekdays.length || calendar.workingWeekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new RangeError("Calendario senza giorni validi");
  const holidays = new Set(calendar.holidays.map(civilDay));
  let remaining = Math.abs(days), iterations = 0;
  while (remaining > 0) {
    if (++iterations > 260_000) throw new RangeError("Calendario non utilizzabile");
    day += Math.sign(days);
    if (calendar.workingWeekdays.includes(new Date(day * 86_400_000).getUTCDay()) && !holidays.has(day)) remaining--;
  }
  return civilDate(day);
}

/** Last supplier working date on/before a deadline, including holidays. */
export function floorWorkingDate(date: string, calendar: DayCalendar): string {
  shiftCivilDays(date, 0, calendar); // Validate the calendar even for zero lead time.
  const holidays = new Set(calendar.holidays.map(civilDay));
  let day = civilDay(date), iterations = 0;
  while (!calendar.workingWeekdays.includes(new Date(day * 86_400_000).getUTCDay()) || holidays.has(day)) {
    if (++iterations > 260_000) throw new RangeError("Calendario non utilizzabile");
    day--;
  }
  return civilDate(day);
}

export function todayInRome(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
