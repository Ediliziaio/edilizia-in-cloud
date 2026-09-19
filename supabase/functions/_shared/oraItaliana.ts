/**
 * L'istante di un evento esterno tradotto nella data e nell'ora italiane con
 * cui vivono gli appuntamenti: `appointment_date` e `appointment_time` non
 * hanno fuso, sono l'ora di Roma.
 *
 * Google manda «2026-10-02T10:00:00+02:00», e l'offset dipende dal fuso del
 * calendario di chi l'ha creato. Il server delle edge function gira in UTC:
 * `new Date(iso).getHours()` restituisce l'ora UTC, e fino al 19/09/2026 ogni
 * evento importato da Google finiva 2 ore prima d'estate e 1 d'inverno (le
 * 10:00 diventavano le 08:00; fra mezzanotte e le due anche il giorno era
 * quello prima).
 */

const FORMATO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** «2026-10-02T08:00:00Z» → { data: "2026-10-02", ora: "10:00" }. */
export function dataOraItaliana(iso: string | null | undefined): { data: string; ora: string } | null {
  if (!iso) return null;
  const istante = new Date(iso);
  if (Number.isNaN(istante.getTime())) return null;
  const p: Record<string, string> = {};
  for (const parte of FORMATO.formatToParts(istante)) p[parte.type] = parte.value;
  return { data: `${p.year}-${p.month}-${p.day}`, ora: `${p.hour}:${p.minute}` };
}
