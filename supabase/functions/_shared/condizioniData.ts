/**
 * Condizioni sulle date nelle automazioni (25/09/2026).
 *
 * Il motore confrontava solo testi e numeri: «l'appuntamento è da oggi in
 * poi?» non si poteva chiedere, e un appuntamento già passato restava
 * «confermato» per sempre. La guardia dei promemoria («ha già prenotato?»)
 * bloccava così anche chi tornava mesi dopo una vecchia demo.
 *
 * Il giorno si legge sempre a Roma: una data pura («2026-09-25») vale per
 * quello che dice, un istante («2026-09-25T22:30:00Z») si porta prima
 * sull'ora italiana, dove è già il 26.
 */

const SOLO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Il giorno a Roma (AAAA-MM-GG) di un istante. */
export function oggiRoma(at: Date = new Date()): string {
  return at.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

/** Il giorno a Roma di un valore data o istante; null se non è una data. */
export function giornoRoma(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && SOLO_DATA.test(v.trim())) return v.trim();
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : oggiRoma(d);
}

export type OperatoreData = "da_oggi" | "prima_di_oggi";
export const OPERATORI_DATA: readonly OperatoreData[] = ["da_oggi", "prima_di_oggi"];

/** «da_oggi»: il giorno è oggi o dopo; «prima_di_oggi»: è già passato. Un valore che non è una data non soddisfa nessuno dei due. */
export function confrontoConOggi(v: unknown, operatore: OperatoreData, at: Date = new Date()): boolean {
  const giorno = giornoRoma(v);
  if (!giorno) return false;
  const oggi = oggiRoma(at);
  return operatore === "da_oggi" ? giorno >= oggi : giorno < oggi;
}
