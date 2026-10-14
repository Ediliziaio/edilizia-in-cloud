const formats = new Map<string, Intl.DateTimeFormat>();

/** Calendar-local midnight, including DST; never silently normalize a bad date. */
export function calendarMidnight(date: string, zone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let format = formats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    if (formats.size >= 32) formats.clear();
    formats.set(zone, format);
  }
  const target = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0,10) !== date) return null;
  let value = target;
  for (let i=0;i<4;i++) {
    const parts: Record<string,string> = {};
    for (const p of format.formatToParts(new Date(value))) parts[p.type] = p.value;
    const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`;
    const delta = target - Date.parse(local);
    if (delta === 0) return new Date(value).toISOString();
    value += delta;
  }
  // Some zones have a skipped midnight; preserve the previous slot instead.
  return null;
}
