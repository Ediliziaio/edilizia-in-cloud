/**
 * Un errore detto a un titolare in cantiere (revisione 2/11, P5). Le funzioni e le RPC di Silvio
 * parlano già italiano, e quei messaggi passano così; quelli del browser, di supabase-js, del
 * database e di una edge function diventano una frase. Mai «Edge Function returned a non-2xx».
 */
const RETE = /failed to fetch|failed to send|networkerror|network request|load failed|fetch failed|relay error/i;
const SESSIONE = /\bjwt\b|unauthorized|invalid claim|not authenticated|auth session/i;
const TROPPO_GRANDE = /too large|exceeded the maximum|\b413\b/i;
const TEMPO = /timeout|timed out|\baborted\b|\b504\b|gateway/i;
const TECNICO = new RegExp([
  "edge function", "non-2xx", "typeerror", "referenceerror", "syntaxerror", "cannot read", "undefined", "is not a function",
  "unexpected token", "internal server", "bad request", "forbidden", "not found", "row-level", "permission denied", "violates",
  "duplicate key", "relation \"", "column \"", "does not exist", "invalid input", "null value", "bucket", "object not",
  // Una chiave del registro («economia.total_amount») o una funzione del database.
  "«[a-z_]+\\.[a-z_]+»", "\\b[a-z]+_[a-z_]+\\(",
].join("|"), "i");

export const RIPIEGO_ERRORE = "Non è andata: riprova. Se succede ancora, scrivi all'assistenza.";

export function erroreLeggibile(e: unknown, ripiego: string = RIPIEGO_ERRORE): string {
  const m = typeof e === "string" ? e : (e as { message?: unknown } | null)?.message;
  const msg = typeof m === "string" ? m.trim() : "";
  if (!msg) return ripiego;
  if (RETE.test(msg)) return "Connessione assente: riprova appena torna la rete.";
  if (SESSIONE.test(msg)) return "La sessione è scaduta: ricarica la pagina e rientra.";
  if (TROPPO_GRANDE.test(msg)) return "Il file è troppo grande: caricane uno più leggero.";
  if (TEMPO.test(msg)) return "Ci ha messo troppo: riprova tra poco.";
  return TECNICO.test(msg) ? ripiego : msg;
}
