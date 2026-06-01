/**
 * userErrorMessage — traduce errori tecnici in messaggi comprensibili per
 * imprenditori edili non tecnici.
 *
 * Problema (audit design 2026-06-01): App.tsx mostrava `error.message` raw nei
 * toast → l'utente vedeva "TypeError: Cannot read property 'x' of undefined" o
 * "FetchError: Failed to fetch" invece di un messaggio azionabile.
 *
 * Questo helper mappa i pattern di errore comuni (rete, auth, permessi, vincoli
 * DB Postgres/PostgREST, timeout) a frasi italiane chiare con un'azione.
 * Il messaggio tecnico originale resta loggato in Sentry/console per il debug.
 */

interface ErrorLike {
  message?: string;
  code?: string | number;
  status?: number;
  // PostgREST / Supabase error shape
  details?: string;
  hint?: string;
  // nested
  error?: { message?: string; code?: string };
}

function extractRaw(error: unknown): { msg: string; code: string; status: number | null } {
  if (!error) return { msg: "", code: "", status: null };
  if (typeof error === "string") return { msg: error.toLowerCase(), code: "", status: null };
  const e = error as ErrorLike;
  const msg = String(e.message ?? e.error?.message ?? e.details ?? "").toLowerCase();
  const code = String(e.code ?? e.error?.code ?? "");
  const status = typeof e.status === "number" ? e.status : null;
  return { msg, code, status };
}

/**
 * Restituisce un messaggio italiano comprensibile per l'utente finale.
 * @param error l'errore catturato
 * @param fallback messaggio di default se nessun pattern matcha
 */
export function userErrorMessage(error: unknown, fallback = "Operazione non riuscita. Riprova tra poco."): string {
  const { msg, code, status } = extractRaw(error);

  // ── Rete / connessione ──────────────────────────────────────────────────
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("err_internet") ||
    msg.includes("err_network")
  ) {
    return "Connessione persa. Controlla la rete e riprova.";
  }

  // ── Timeout / abort ─────────────────────────────────────────────────────
  if (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborted") ||
    msg.includes("aborterror") ||
    code === "20"
  ) {
    return "L'operazione ha impiegato troppo tempo. Riprova.";
  }

  // ── Auth / sessione scaduta ─────────────────────────────────────────────
  if (
    status === 401 ||
    msg.includes("jwt") ||
    msg.includes("not authenticated") ||
    msg.includes("invalid token") ||
    msg.includes("session") && msg.includes("expired") ||
    msg.includes("unauthorized")
  ) {
    return "Sessione scaduta. Accedi di nuovo per continuare.";
  }

  // ── Permessi / RLS ──────────────────────────────────────────────────────
  if (
    status === 403 ||
    code === "42501" || // insufficient_privilege
    msg.includes("permission denied") ||
    msg.includes("row-level security") ||
    msg.includes("not allowed") ||
    msg.includes("forbidden")
  ) {
    return "Non hai i permessi per questa operazione. Contatta l'amministratore.";
  }

  // ── Vincoli DB (Postgres) ───────────────────────────────────────────────
  if (code === "23505" || msg.includes("duplicate key") || msg.includes("already exists")) {
    return "Esiste già un elemento con questi dati. Controlla e riprova.";
  }
  if (code === "23503" || msg.includes("foreign key") || msg.includes("violates foreign key")) {
    return "Impossibile completare: l'elemento è collegato ad altri dati.";
  }
  if (code === "23502" || msg.includes("not-null") || msg.includes("null value")) {
    return "Mancano alcuni dati obbligatori. Completa i campi richiesti.";
  }
  if (code === "23514" || msg.includes("check constraint")) {
    return "Alcuni dati non sono validi. Controlla i valori inseriti.";
  }

  // ── Server ──────────────────────────────────────────────────────────────
  if ((status !== null && status >= 500) || msg.includes("internal server error")) {
    return "Errore temporaneo del server. Riprova tra qualche istante.";
  }

  // ── Storage / file troppo grande ────────────────────────────────────────
  if (msg.includes("payload too large") || msg.includes("file size") || status === 413) {
    return "Il file è troppo grande. Usa un file più leggero.";
  }

  return fallback;
}
