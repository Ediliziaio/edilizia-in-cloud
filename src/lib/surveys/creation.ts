/** Optional appointment in the browser's local timezone; never send an ambiguous local timestamp. */
export function surveyAppointment(day: string, time: string): string | null {
  if (!day) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error("Completa data e ora dell’appuntamento.");
  const d = new Date(`${day}T${time}:00`);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (
    Number.isNaN(d.getTime()) ||
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` !== day ||
    `${pad(d.getHours())}:${pad(d.getMinutes())}` !== time
  )
    throw new Error("Data o ora non valide: scegli un altro appuntamento.");
  return d.toISOString();
}
export function surveyCreationError(
  zip: string,
  day: string,
  time: string,
): string | null {
  if (zip.trim() && !/^\d{5}$/.test(zip.trim()))
    return "Il CAP deve contenere 5 cifre, oppure puoi lasciarlo vuoto.";
  try {
    surveyAppointment(day, time);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
