/**
 * Quale automazione del bot è dovuta ADESSO (28/09/2026).
 *
 * Il dispatcher gira ogni 15 minuti (pg_cron): una routine con orario parte se
 * è il suo giorno e siamo nella finestra di 15 minuti dopo l'ora impostata. Ora
 * e giorno sono in fuso italiano. Le routine di tipo «avviso» non passano di qui
 * (sono guidate dagli eventi, non dall'orario).
 */

export interface RoutineTemporale {
  ora: string | null; // "HH:MM"
  giorni: number[]; // 1=lun … 7=dom
}

const GIORNO: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** {giorno:1..7, minuti:0..1439} in ora italiana. */
export function oraItalianaParti(adesso: Date): { giorno: number; minuti: number } {
  const parti = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(adesso);
  const val = (t: string) => parti.find((p) => p.type === t)?.value ?? "";
  const giorno = GIORNO[val("weekday")] ?? 0;
  // "24" a mezzanotte in alcune locali: normalizzo a 0.
  const h = Number(val("hour")) % 24;
  const m = Number(val("minute"));
  return { giorno, minuti: h * 60 + m };
}

function parseHHMM(v: string): number | null {
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function routineDovutaOra(r: RoutineTemporale, adesso: Date, force = false): boolean {
  if (force) return true;
  if (!r.ora) return false;
  const target = parseHHMM(r.ora);
  if (target == null) return false;
  const { giorno, minuti } = oraItalianaParti(adesso);
  if (!r.giorni.includes(giorno)) return false;
  return minuti >= target && minuti < target + 15;
}
