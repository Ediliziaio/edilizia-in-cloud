import { addDays, format, parseISO } from "date-fns";
import type { ConflictEntry } from "@/hooks/useConflictDetection";
export interface CalendarConflictGroup extends ConflictEntry {
  to: string;
  days: number;
}
/** Giorni consecutivi con la stessa risorsa e gli stessi eventi formano un'unica verifica. */
export function groupCalendarConflicts(
  conflicts: ConflictEntry[],
): CalendarConflictGroup[] {
  const buckets = new Map<string, ConflictEntry[]>();
  for (const conflict of conflicts) {
    const signature = JSON.stringify([
      conflict.resourceType,
      conflict.resourceId,
      conflict.severity,
      conflict.reason,
      conflict.events
        .map((e) => [e.type, e.id, e.label, e.start, e.end])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ]);
    const list = buckets.get(signature) ?? [];
    list.push(conflict);
    buckets.set(signature, list);
  }
  const groups: CalendarConflictGroup[] = [];
  for (const rows of buckets.values()) {
    let current: CalendarConflictGroup | undefined;
    for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
      if (
        current &&
        row.date === format(addDays(parseISO(current.to), 1), "yyyy-MM-dd")
      ) {
        current.to = row.date;
        current.days += 1;
      } else {
        current = { ...row, to: row.date, days: 1 };
        groups.push(current);
      }
    }
  }
  return groups.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.resourceName.localeCompare(b.resourceName),
  );
}
