export const CALENDAR_COLORS = [
  "bg-blue-500/20 border-blue-500 text-blue-900 dark:text-blue-200",
  "bg-green-500/20 border-green-500 text-green-900 dark:text-green-200",
  "bg-purple-500/20 border-purple-500 text-purple-900 dark:text-purple-200",
  "bg-orange-500/20 border-orange-500 text-orange-900 dark:text-orange-200",
  "bg-pink-500/20 border-pink-500 text-pink-900 dark:text-pink-200",
  "bg-cyan-500/20 border-cyan-500 text-cyan-900 dark:text-cyan-200",
];

export const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);

export const HALF_HOURS: string[] = HOURS.flatMap((h) => [
  `${String(h).padStart(2, "0")}:00`,
  `${String(h).padStart(2, "0")}:30`,
]);

export function buildTimeSlots(slotMinutes: number): string[] {
  const slots: string[] = [];
  for (let m = 8 * 60; m < 22 * 60; m += slotMinutes) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return slots;
}

export function buildColorMap(calendarIds: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  calendarIds.forEach((id, i) => {
    map[id] = CALENDAR_COLORS[i % CALENDAR_COLORS.length];
  });
  return map;
}
