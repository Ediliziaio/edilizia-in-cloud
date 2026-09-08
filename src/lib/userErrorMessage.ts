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
 * isTransientTimeoutError — true se l'errore è un timeout/abort transitorio
 * (DB lento/cold, AbortController, 503 abortito). Usa la STESSA estrazione di
 * userErrorMessage (inclusi i campi annidati e.error.* / e.details), così chi
 * sopprime il toast "Riprova" su questi casi non diverge dalla mappatura.
 */
export function isTransientTimeoutError(error: unknown): boolean {
  const { msg, code } = extractRaw(error);
  const name = String((error as { name?: string } | null)?.name ?? "").toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborted") ||
    msg.includes("aborterror") ||
    name === "aborterror" ||
    code === "20"
  );
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
  if (code === "22001" || msg.includes("value too long")) {
    return "Un testo è troppo lungo per il campo. Accorcialo e riprova.";
  }
  if (code === "22P02" || msg.includes("invalid input syntax")) {
    return "Alcuni dati non sono nel formato giusto. Controlla i valori inseriti.";
  }
  if (code === "40P01" || msg.includes("deadlock detected")) {
    return "Il sistema era occupato. Riprova tra qualche istante.";
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

/**
 * Il testo tecnico completo di un errore: messaggio + dettagli, cosi' com'e'.
 *
 * Serve a chi deve RICONOSCERE un errore ("does not exist", "permission
 * denied", "duplicate"), non a mostrarlo. Dopo traduciErrorePostgrest il
 * `message` e' in italiano e l'originale inglese sta in `details`: chi guarda
 * solo `message` non riconosce piu' niente.
 */
export function testoTecnico(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  const e = error as ErrorLike;
  const pezzi = [e.message, e.details, e.error?.message].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  return pezzi.length > 0 ? pezzi.join(" ") : String(error);
}

/**
 * I messaggi che Postgres e PostgREST scrivono in inglese, per la macchina.
 * Solo questi vengono tradotti: un RAISE EXCEPTION scritto in italiano da un
 * trigger ("Non si può togliere il ruolo al titolare…") non combacia con
 * nessuno di questi e passa intatto, anche se porta un codice come 42501.
 */
export const MESSAGGI_POSTGRES_GREZZI: readonly RegExp[] = [
  /^(update|insert) or (delete|update) on table/i,
  /^duplicate key value/i,
  /^null value in column/i,
  /^new row (for relation|violates)/i,
  /^permission denied/i,
  /^value too long for type/i,
  /^invalid input (syntax|value)/i,
  /^canceling statement due to/i,
  /^deadlock detected/i,
  /violates (foreign key|check|not-null|unique|row-level security)/i,
  /^jwt\b|^invalid (jwt|token)/i,
];

export function sembraErrorePostgresGrezzo(message: string): boolean {
  return MESSAGGI_POSTGRES_GREZZI.some((re) => re.test(message));
}

/**
 * Traduce il corpo di un errore PostgREST PRIMA che arrivi al resto dell'app.
 *
 * Il 7 settembre 2026 un titolare si e' visto arrivare a schermo
 * «update or delete on table "marketing_opportunities" violates foreign key
 * constraint "fv_progetti_opportunita_crm_id_fkey"». Il gestore globale delle
 * mutation traduce gia' (vedi App.tsx), ma in giro per l'app ci sono
 * seicento `toast.error(e.message)` locali che mostrano il testo com'e'.
 * Invece di rincorrerli uno per uno, il client Supabase passa da qui: il
 * `message` diventa la frase italiana, il testo originale finisce in
 * `details` (per i log e per chi deve riconoscerlo: vedi testoTecnico), il
 * `code` resta com'e'.
 *
 * Restituisce null quando non c'e' niente da tradurre: messaggio gia' umano,
 * oppure un errore che nessun pattern riconosce.
 */
export function traduciErrorePostgrest(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as { message?: unknown; code?: unknown; details?: unknown };
  if (typeof b.message !== "string" || b.message.length === 0) return null;
  if (!sembraErrorePostgresGrezzo(b.message)) return null;
  const umano = userErrorMessage(
    { message: b.message, code: typeof b.code === "string" ? b.code : undefined },
    "",
  );
  if (!umano || umano === b.message) return null;
  const dettagliOriginali = typeof b.details === "string" && b.details ? b.details : null;
  return {
    ...b,
    message: umano,
    details: dettagliOriginali ? `${b.message} · ${dettagliOriginali}` : b.message,
  };
}
