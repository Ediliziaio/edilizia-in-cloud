/**
 * Le date di Silvio sono in ora italiana (1/11/2026, fase 4). Il database e le edge function
 * girano in UTC: fra mezzanotte e le due in Italia è già domani, e `toISOString()` o
 * `current_date` danno ancora ieri. Qui il giorno di calendario a Roma, e i conti fra date
 * AAAA-MM-GG fatti come giorni di calendario, senza ore.
 *
 * Senza dipendenze, compatibile con Deno.
 */

/** AAAA-MM-GG di oggi (o di `d`) a Roma. */
export function oggiInItalia(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** La data come giorno (millisecondi a mezzanotte UTC), o NaN. */
function giorno(data: string): number {
  const m = DATA.exec(data);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Number.NaN;
}

export const eData = (s: unknown): s is string => typeof s === "string" && DATA.test(s);

/** Una data che esiste sul calendario: il 31 febbraio ha la forma giusta, ma non c'è. */
export function dataVera(s: unknown): s is string {
  if (!eData(s)) return false;
  const g = giorno(s);
  return !Number.isNaN(g) && new Date(g).toISOString().slice(0, 10) === s;
}

/** `data` più `n` giorni di calendario (anche negativi). */
export function aggiungiGiorni(data: string, n: number): string {
  const g = giorno(data);
  if (Number.isNaN(g)) return data;
  return new Date(g + n * 86_400_000).toISOString().slice(0, 10);
}

/** Giorni di calendario da `da` ad `a` (positivo se `a` è dopo). */
export function giorniTra(da: string, a: string): number {
  return Math.round((giorno(a) - giorno(da)) / 86_400_000);
}

/** Due periodi [dal, al] si toccano? `al` null = aperto. Le date mancanti non si toccano mai. */
export function siSovrappongono(a: { dal: string | null; al: string | null }, b: { dal: string | null; al: string | null }): boolean {
  if (!a.dal || !b.dal) return false;
  const fineA = a.al ?? "9999-12-31";
  const fineB = b.al ?? "9999-12-31";
  return a.dal <= fineB && b.dal <= fineA;
}

const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** «26 ott»: come si dice una scadenza a chi legge in cantiere. */
export function dataConMese(data: string): string {
  const m = DATA.exec(data);
  return m ? `${Number(m[3])} ${MESI_BREVI[Number(m[2]) - 1]}` : data;
}

/** «12/11»: la data breve dei testi di Silvio. */
export function dataCorta(data: string): string {
  const m = DATA.exec(data);
  return m ? `${m[3]}/${m[2]}` : data;
}
