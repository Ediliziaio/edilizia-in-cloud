/**
 * Perché Supabase rifiuta la password nuova, detto a chi la sta scegliendo
 * (25/09/2026).
 *
 * Supabase rifiuta una password già comparsa in furti di dati (controllo
 * «leaked password», motivo `pwned`) o uguale a quella di prima. Le pagine
 * mostravano «Errore durante il cambio password» o la frase inglese, e chi
 * era costretto a cambiarla riprovava la stessa all'infinito: Andrea Urban
 * (Renova) dieci volte in due minuti, e restava fuori.
 *
 * Nessun import: lo leggono le pagine e i test.
 */

interface ErroreAuth {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  reasons?: unknown;
}

export function motivoPasswordRifiutata(errore: unknown): string {
  const e = (errore && typeof errore === "object" ? errore : {}) as ErroreAuth;
  const codice = typeof e.code === "string" ? e.code : "";
  const testo = typeof e.message === "string" ? e.message.toLowerCase() : "";
  const motivi = Array.isArray(e.reasons) ? e.reasons.map(String) : [];

  if (codice === "same_password" || testo.includes("different from the old password")) {
    return "La nuova password è uguale a quella di adesso: scegline una diversa.";
  }
  if (codice === "weak_password" || e.name === "AuthWeakPasswordError" || testo.includes("known to be weak")) {
    if (motivi.includes("pwned") || testo.includes("known to be weak")) {
      return (
        "Questa password è troppo comune o è già comparsa in furti di dati su internet, quindi non è sicura. " +
        "Scegline un'altra, più lunga e meno prevedibile: per esempio tre parole a caso con un numero."
      );
    }
    if (motivi.includes("length")) return "La password è troppo corta: scegline una più lunga.";
    if (motivi.includes("characters")) {
      return "La password deve avere lettere minuscole e maiuscole, numeri e simboli.";
    }
    return "La password è troppo debole: scegline una più lunga e meno prevedibile.";
  }
  if (codice.startsWith("over_") && codice.endsWith("rate_limit")) {
    return "Troppi tentativi in poco tempo: aspetta qualche minuto e riprova.";
  }
  if (codice === "reauthentication_needed" || codice === "session_not_found" || e.name === "AuthSessionMissingError") {
    return "L'accesso è scaduto: rientra con la password attuale e riprova.";
  }
  return "Non è stato possibile cambiare la password. Riprova tra poco.";
}
