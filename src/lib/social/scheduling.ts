/** Data locale del composer. Non lancia mai RangeError e non normalizza date/ore inesistenti. */
export function parseSocialSchedule(day: string, time: string, options: {
  required?: boolean; future?: boolean; now?: number;
} = {}): { scheduledAt: string; error?: never } | { scheduledAt?: never; error: string } {
  if (!day) return options.required ? { error: "Scegli il giorno di pubblicazione." } : { scheduledAt: "" };
  if (!time) return { error: "Scegli l’ora di pubblicazione." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: "Controlla giorno e ora di pubblicazione." };
  const date = new Date(`${day}T${time}`);
  const [year, month, dateDay] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== dateDay
      || date.getHours() !== hour || date.getMinutes() !== minute) return { error: "La data o l’ora scelta non esiste: scegline un’altra." };
  if (options.future && date.getTime() <= (options.now ?? Date.now()) + 60_000) return { error: "Scegli un orario almeno un minuto nel futuro, oppure usa Pubblica ora." };
  return { scheduledAt: date.toISOString() };
}
