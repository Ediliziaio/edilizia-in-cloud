/**
 * outreach-schedule — finestra di invio PURA (niente Deno/Supabase, solo Intl).
 * Il cold parte solo in orari "umani" (default Lun-Ven 8-19 Europe/Rome):
 * niente invii di notte o nel weekend → meno spam, più risposte. Testato in vitest.
 */

export interface SendWindow {
  days: number[];     // 0=Dom, 1=Lun, … 6=Sab
  startHour: number;  // incluso
  endHour: number;    // escluso
  timeZone: string;
}

export const DEFAULT_SEND_WINDOW: SendWindow = {
  days: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 19,
  timeZone: "Europe/Rome",
};

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Ora (0-23) e giorno settimana (0-6) di un istante in un fuso, via Intl (gestisce la DST). */
export function localParts(date: Date, timeZone: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(date);
  let hour = 0, weekday = 0;
  for (const p of parts) {
    if (p.type === "hour") hour = parseInt(p.value, 10) % 24;
    else if (p.type === "weekday") weekday = WEEKDAY[p.value] ?? 0;
  }
  return { hour, weekday };
}

/** Minuti dalla mezzanotte locale (0-1439) di un istante in un fuso, via Intl (gestisce la DST). */
export function minutoDelGiorno(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  let h = 0, m = 0;
  for (const p of parts) {
    if (p.type === "hour") h = parseInt(p.value, 10) % 24;
    else if (p.type === "minute") m = parseInt(p.value, 10);
  }
  return h * 60 + m;
}

/**
 * La finestra in cui spedisce un brand. La decide il brand: il motore gira
 * tutti i giorni a tutte le ore, e ogni brand sceglie i giorni e gli orari
 * suoi. Un brand che non ha scelto niente spedisce lun–ven 8–19, così il
 * cold di notte o di domenica non parte mai per dimenticanza.
 *
 * Prima c'era anche una finestra di piattaforma, e il motore si fermava lì
 * prima ancora di guardare il brand: ThermoDMR era impostato lun–sab e il
 * sabato non partiva niente, senza che nessuna pagina lo dicesse.
 */
export function finestraDelBrand(raw: unknown): SendWindow {
  if (raw == null) return DEFAULT_SEND_WINDOW;
  return parseSendWindow(raw);
}

/** True se l'istante cade nella finestra (giorno consentito e ora tra start e end). */
export function isWithinSendWindow(date: Date, w: SendWindow = DEFAULT_SEND_WINDOW): boolean {
  const { hour, weekday } = localParts(date, w.timeZone);
  if (!w.days.includes(weekday)) return false;
  return hour >= w.startHour && hour < w.endHour;
}

/**
 * Costruisce una SendWindow da config salvata (outreach_brands.send_window),
 * validando ogni campo e ripiegando sui default.
 * Robusta a input malformati: non lancia mai.
 */
export function parseSendWindow(raw: unknown): SendWindow {
  let o: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return DEFAULT_SEND_WINDOW; }
  } else if (raw && typeof raw === "object") {
    o = raw as Record<string, unknown>;
  }
  if (!o) return DEFAULT_SEND_WINDOW;

  const rawDays = Array.isArray(o.days) ? o.days : null;
  const days = rawDays
    ? [...new Set(rawDays.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))]
    : DEFAULT_SEND_WINDOW.days;

  const sh = typeof o.startHour === "number" && Number.isInteger(o.startHour) && o.startHour >= 0 && o.startHour <= 23
    ? o.startHour : DEFAULT_SEND_WINDOW.startHour;
  const eh = typeof o.endHour === "number" && Number.isInteger(o.endHour) && o.endHour >= 1 && o.endHour <= 24
    ? o.endHour : DEFAULT_SEND_WINDOW.endHour;
  const tz = typeof o.timeZone === "string" && o.timeZone.trim() ? o.timeZone : DEFAULT_SEND_WINDOW.timeZone;

  const valid = sh < eh;
  return {
    days: days.length ? days : DEFAULT_SEND_WINDOW.days,
    startHour: valid ? sh : DEFAULT_SEND_WINDOW.startHour,
    endHour: valid ? eh : DEFAULT_SEND_WINDOW.endHour,
    timeZone: tz,
  };
}
