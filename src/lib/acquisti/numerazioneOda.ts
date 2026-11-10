/**
 * Numerazione degli ordini ai fornitori (purchase_orders.oda_number).
 *
 * Il numero vero lo assegna il database (generate_oda_number, migrazione
 * 20290131160000): qui c'è solo lo stesso formato, per far vedere subito come
 * verrà il numero mentre si scrive il formato, prima di salvarlo.
 * Segnaposti: {n} numero senza zeri, {n:4} con zeri fino a 4 cifre,
 * {anno} 2026, {aa} 26.
 */

export const FORMATO_ODA_PREDEFINITO = "ODA-{anno}-{n:4}";
export const FORMATO_ODA_LUNGHEZZA_MAX = 40;

/** Stesso calcolo di public.oda_formatta_numero. */
export function formattaNumeroOda(formato: string | null | undefined, n: number, data: Date = new Date()): string {
  const anno = String(data.getFullYear());
  let r = (formato ?? "").trim() || "{n}";
  r = r.split("{anno}").join(anno).split("{aa}").join(anno.slice(-2));
  r = r.replace(/\{n:(\d{1,2})\}/g, (_, cifre: string) => String(n).padStart(Number(cifre), "0"));
  return r.split("{n}").join(String(n));
}

/** Null se il formato va bene, altrimenti la frase da mostrare. */
export function erroreFormatoOda(formato: string): string | null {
  const f = formato.trim();
  if (!f) return "Scrivi un formato, per esempio {n}.";
  if (f.length > FORMATO_ODA_LUNGHEZZA_MAX) return `Al massimo ${FORMATO_ODA_LUNGHEZZA_MAX} caratteri.`;
  if (!/\{n(:\d{1,2})?\}/.test(f)) return "Nel formato serve {n}, il numero che cresce.";
  return null;
}

/** Null se il prossimo numero va bene, altrimenti la frase da mostrare. */
export function erroreProssimoOda(valore: string): string | null {
  const t = valore.trim();
  if (!/^\d+$/.test(t)) return "Il prossimo numero è un intero, senza lettere.";
  const n = Number(t);
  if (n < 1 || n > 2_147_483_647) return "Il prossimo numero parte da 1.";
  return null;
}

/** Il numero da mandare all'insert del nuovo ordine: null se va lasciato al database. */
export function numeroManualeOda(scritto: string | null, anteprima: string | null | undefined): string | null {
  const t = scritto?.trim() ?? "";
  if (!t || t === (anteprima ?? "").trim()) return null;
  return t;
}

/** Errore di Postgres/PostgREST quando si scrive un numero d'ordine. */
export function messaggioErroreNumeroOda(errore: unknown, numero: string): string {
  const e = (errore ?? {}) as { code?: string; message?: string };
  if (e.code === "23505" || /uq_oda_number_company|duplicate key/i.test(e.message ?? "")) {
    return `Il numero ${numero} è già usato da un altro ordine`;
  }
  if (e.code === "42501") return "Non hai il permesso di modificare questo ordine";
  return e.message || "Non riesco a salvare il numero";
}
