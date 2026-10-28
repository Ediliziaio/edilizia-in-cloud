export type Holiday = { data: string; ricorrente: boolean; descrizione: string };
const DAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

export function isoDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Data non valida");
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Data non valida");
  return date;
}

/** Recurring Feb 29 does not become March 1 in non-leap years. */
export function projectHoliday<T extends Holiday>(holiday: T, year: number): (T & { projectedDate: string }) | null {
  const projectedDate = holiday.ricorrente ? `${year}-${holiday.data.slice(5)}` : holiday.data;
  if (!projectedDate.startsWith(`${year}-`)) return null;
  try { isoDay(projectedDate); } catch { return null; }
  return { ...holiday, projectedDate };
}

export function easterSunday(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return `${year}-${String(Math.floor(n / 31)).padStart(2, "0")}-${String(n % 31 + 1).padStart(2, "0")}`;
}

/** Suggested calendar; patron saint, local closures and contractual exceptions remain explicit. */
export function italianHolidays(year: number): Holiday[] {
  if (!Number.isInteger(year) || year < 1900 || year > 2199) throw new Error("Anno non valido");
  const fixed = [["01-01", "Capodanno"], ["01-06", "Epifania"], ["04-25", "Festa della Liberazione"],
    ["05-01", "Festa dei Lavoratori"], ["06-02", "Festa della Repubblica"], ["08-15", "Ferragosto"],
    ...(year >= 2026 ? [["10-04", "San Francesco d’Assisi"]] : []),
    ["11-01", "Tutti i Santi"], ["12-08", "Immacolata Concezione"], ["12-25", "Natale"], ["12-26", "Santo Stefano"]];
  const easter = easterSunday(year), monday = isoDay(easter);
  monday.setUTCDate(monday.getUTCDate() + 1);
  return [...fixed.map(([day, descrizione]) => ({ data: `${year}-${day}`, descrizione, ricorrente: true })),
    { data: easter, descrizione: "Pasqua", ricorrente: false },
    { data: monday.toISOString().slice(0, 10), descrizione: "Lunedì dell’Angelo", ricorrente: false }].sort((a, b) => a.data.localeCompare(b.data));
}

export function missingItalianHolidays(existing: Holiday[], year: number) {
  const dates = new Set(existing.flatMap((h) => { const projected = projectHoliday(h, year); return projected ? [projected.projectedDate] : []; }));
  return italianHolidays(year).filter((h) => !dates.has(h.data));
}

/** No guessed workweek: missing/invalid schedules must be repaired before estimating leave. */
export function workingDates(start: string, end: string, weekdays: readonly string[], holidays: Holiday[]): string[] {
  const cursor = isoDay(start), last = isoDay(end);
  if (last < cursor || (last.getTime() - cursor.getTime()) / 86400000 > 3660) throw new Error("Intervallo date non valido");
  if (!weekdays.length || weekdays.some((day) => !DAYS.includes(day))) throw new Error("Calendario lavorativo da configurare");
  const closed = new Set<string>();
  for (let year = cursor.getUTCFullYear(); year <= last.getUTCFullYear(); year++) {
    holidays.forEach((h) => { const p = projectHoliday(h, year); if (p) closed.add(p.projectedDate); });
  }
  const result: string[] = [];
  for (; cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.toISOString().slice(0, 10);
    if (weekdays.includes(DAYS[cursor.getUTCDay()]) && !closed.has(day)) result.push(day);
  }
  return result;
}
