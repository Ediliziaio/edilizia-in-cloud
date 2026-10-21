/** Metadati del video effettivamente incorporato, verificati il 21/10/2026
 * su https://www.youtube.com/watch?v=wBpdDN21vb0 (VideoObject di YouTube).
 * La data del vecchio filmato locale non descrive questo video.
 */
export const RENDER_INFISSI_VIDEO = {
  id: "wBpdDN21vb0",
  uploadDate: "2026-05-14T03:44:17-07:00",
  duration: "PT38S",
} as const;

/** Una data senza ora/fuso non basta per il VideoObject. Nessuna data inventata. */
export function isVideoUploadDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendarDay = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(Date.parse(value)) && calendarDay.getUTCFullYear() === year && calendarDay.getUTCMonth() === month - 1 && calendarDay.getUTCDate() === day;
}
