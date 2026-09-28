// Gli impegni dei calendari esterni (Google/Apple/Outlook) arrivano in
// `google_calendar_busy_slots.start_at` come timestamptz e PostgREST li
// serializza in UTC (es. "2026-09-28T10:00:00+00:00"). Il calendario prima
// leggeva l'ora con `start_at.slice(11,16)` → prendeva "10:00" (UTC) invece
// delle 12:00 italiane, così ogni evento compariva DUE ore prima e sembrava
// un doppione degli appuntamenti CRM (che invece usano l'ora locale salvata).
//
// Qui la conversione a Europe/Rome, indipendente dal fuso del browser.

const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23", // 00–23, niente "24:00" a mezzanotte
});

/** Data ("YYYY-MM-DD") e ora ("HH:mm") in Europe/Rome da un ISO/timestamptz. */
export function partiOraRoma(iso: string | null | undefined): { data: string; hm: string } {
  if (!iso) return { data: "", hm: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // Fallback difensivo: se non è una data valida, torno ai vecchi slice.
    return { data: iso.slice(0, 10), hm: iso.slice(11, 16) };
  }
  const p = FMT.formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { data: `${get("year")}-${get("month")}-${get("day")}`, hm: `${get("hour")}:${get("minute")}` };
}

/** Solo l'ora "HH:mm" in Europe/Rome. */
export function oraRomaHM(iso: string | null | undefined): string {
  return partiOraRoma(iso).hm;
}

/** Solo la data "YYYY-MM-DD" in Europe/Rome. */
export function dataRomaISO(iso: string | null | undefined): string {
  return partiOraRoma(iso).data;
}
