/**
 * Le date dei documenti si scrivono col giorno ITALIANO.
 *
 * Il server delle edge function gira in UTC: `new Date(iso).toLocaleDateString("it-IT")`
 * dà il giorno UTC, e fra mezzanotte e le due (d'estate; fino all'una d'inverno)
 * ora italiana quel giorno è quello PRIMA. Un preventivo salvato alle 00:30 del
 * 6 ottobre usciva datato 5 ottobre, e la sua validità («valido fino al…»)
 * finiva un giorno prima di quello che il cliente aveva diritto di leggere.
 */

const FUSO = "Europe/Rome";
const LUNGA = new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, day: "numeric", month: "long", year: "numeric" });
// Lo stesso formato di toLocaleDateString("it-IT"): 6/10/2026.
const BREVE = new Intl.DateTimeFormat("it-IT", { timeZone: FUSO });
const SOLO_ANNO = new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, year: "numeric" });

function istante(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «6 ottobre 2026»; vuoto se la data manca o non è valida. */
export function dataItalianaLunga(v: string | number | Date | null | undefined): string {
  const d = istante(v);
  return d ? LUNGA.format(d) : "";
}

/** «6/10/2026»; vuoto se la data manca o non è valida. */
export function dataItalianaBreve(v: string | number | Date | null | undefined): string {
  const d = istante(v);
  return d ? BREVE.format(d) : "";
}

/** L'anno in Italia («2027» un minuto dopo la mezzanotte di Capodanno, anche se in UTC è ancora il 2026). */
export function annoItaliano(v: string | number | Date | null | undefined): string {
  const d = istante(v);
  return d ? SOLO_ANNO.format(d) : "";
}
