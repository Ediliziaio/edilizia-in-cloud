/**
 * Estrae un messaggio leggibile da un errore arbitrario.
 *
 * Caso d'uso principale: errori Supabase (`PostgrestError`) non sono istanze
 * di `Error`, quindi `String(error)` restituisce "[object Object]".
 * Questo helper recupera `.message` se presente, normalizza i casi limite
 * e fornisce un fallback JSON tronco quando proprio non c'è altro.
 *
 * Esempi:
 *   formatError(new Error("X"))                       → "X"
 *   formatError({ message: "RLS policy denied" })     → "RLS policy denied"
 *   formatError({ code: "42P01", details: "no rel" }) → '42P01: no rel'
 *   formatError("plain string")                       → "plain string"
 *   formatError(null)                                 → "Errore sconosciuto"
 */
export function formatError(err: unknown): string {
  if (!err) return "Errore sconosciuto";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    // Supabase PostgrestError: { message, details, hint, code }
    if (typeof e.message === "string" && e.message.length > 0) {
      const parts: string[] = [e.message];
      if (typeof e.code === "string" && e.code) parts.push(`(${e.code})`);
      return parts.join(" ");
    }
    // Codice senza message
    if (typeof e.code === "string" && e.code) {
      const detail = typeof e.details === "string" ? `: ${e.details}` : "";
      return `${e.code}${detail}`;
    }
    // Ultima spiaggia: JSON tronco
    try {
      const json = JSON.stringify(err);
      return json.length > 200 ? `${json.slice(0, 197)}…` : json;
    } catch {
      return "Errore sconosciuto";
    }
  }
  return String(err);
}
