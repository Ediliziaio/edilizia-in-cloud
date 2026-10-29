/**
 * Il messaggio di un errore, qualunque cosa sia stata lanciata.
 *
 * `String(e)` su un oggetto che non è un Error dà «[object Object]»: il 28/10/2026
 * silvio-memory-extract ha scritto 49 righe così, una per utente, e la causa non
 * si è più saputa. Chi lancia un errore di PostgREST (`if (error) throw error`)
 * lancia un oggetto semplice con message/code/details/hint, non un Error.
 *
 * Qui si tiene il messaggio quando c'è, e in sua assenza il JSON: una riga di log
 * sempre leggibile, senza segreti in più di quelli che l'errore porta già.
 */
export function messaggioErrore(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e === null || e === undefined) return String(e);
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parti = [o.message, o.error_description, o.error, o.detail, o.details, o.hint]
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    const codice = typeof o.code === "string" || typeof o.code === "number" ? `[${o.code}] ` : "";
    if (parti.length > 0) return codice + parti.join(" — ");
    try {
      const serializzato = JSON.stringify(e);
      if (serializzato && serializzato !== "{}") return codice + serializzato;
    } catch { /* riferimenti circolari: resta il fallback qui sotto */ }
    return codice ? codice.trim() : Object.prototype.toString.call(e);
  }
  return String(e);
}
