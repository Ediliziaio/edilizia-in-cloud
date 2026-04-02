/**
 * mapError — maps raw error objects to user-friendly Italian messages.
 *
 * Covers:
 *  - Supabase/PostgREST error codes
 *  - Network/fetch errors
 *  - Auth errors
 *  - Generic fallbacks
 *
 * Usage:
 *   catch (err) { toast.error(mapError(err)); }
 */

interface MappedError {
  title: string;
  description?: string;
}

// Supabase/PostgREST error code → friendly message
const POSTGRES_ERROR_MAP: Record<string, MappedError> = {
  // Auth
  "invalid_credentials":     { title: "Credenziali non valide", description: "Email o password errata." },
  "email_not_confirmed":     { title: "Email non confermata", description: "Controlla la tua casella di posta." },
  "over_email_send_rate_limit": { title: "Troppe richieste", description: "Attendi qualche minuto prima di riprovare." },
  "session_not_found":       { title: "Sessione scaduta", description: "Effettua di nuovo il login." },
  // DB constraint violations
  "23505": { title: "Record già esistente", description: "Un elemento con questi dati esiste già." },
  "23503": { title: "Riferimento non valido", description: "Il record collegato non esiste." },
  "23502": { title: "Campo obbligatorio mancante", description: "Compila tutti i campi richiesti." },
  "42501": { title: "Permesso negato", description: "Non hai i permessi per questa operazione." },
  "42P01": { title: "Errore di configurazione", description: "Tabella non trovata. Contatta il supporto." },
  // Row Level Security
  "PGRST116": { title: "Nessun risultato", description: "Il record non esiste o non hai i permessi per visualizzarlo." },
  "PGRST301": { title: "Permesso negato", description: "Non hai i permessi per questa operazione." },
};

// Network/HTTP status → friendly message
const HTTP_STATUS_MAP: Record<number, MappedError> = {
  400: { title: "Richiesta non valida",    description: "Verifica i dati inseriti e riprova." },
  401: { title: "Sessione scaduta",        description: "Effettua di nuovo il login." },
  403: { title: "Accesso negato",          description: "Non hai i permessi per questa operazione." },
  404: { title: "Risorsa non trovata",     description: "Il contenuto richiesto non esiste." },
  409: { title: "Conflitto",              description: "Un record con questi dati esiste già." },
  422: { title: "Dati non validi",         description: "Verifica i campi e riprova." },
  429: { title: "Troppe richieste",        description: "Hai superato il limite di richieste. Attendi e riprova." },
  500: { title: "Errore del server",       description: "Si è verificato un problema. Riprova tra qualche minuto." },
  502: { title: "Servizio non disponibile",description: "Il server è temporaneamente irraggiungibile." },
  503: { title: "Servizio in manutenzione",description: "Il servizio è temporaneamente non disponibile." },
};

// Network error patterns
const NETWORK_PATTERNS: Array<{ pattern: RegExp; mapped: MappedError }> = [
  { pattern: /fetch|network|failed to fetch|networkerror/i, mapped: { title: "Errore di rete", description: "Controlla la connessione a internet e riprova." } },
  { pattern: /timeout|timed out/i,                           mapped: { title: "Timeout",        description: "La richiesta ha impiegato troppo tempo. Riprova." } },
  { pattern: /aborted/i,                                     mapped: { title: "Operazione annullata", description: "La richiesta è stata annullata." } },
  { pattern: /jwt expired|token expired/i,                   mapped: { title: "Sessione scaduta", description: "Effettua di nuovo il login." } },
  { pattern: /permission denied/i,                           mapped: { title: "Permesso negato", description: "Non hai i permessi per questa operazione." } },
  { pattern: /duplicate key/i,                               mapped: { title: "Record già esistente", description: "Un elemento con questi dati esiste già." } },
  { pattern: /not null violation/i,                          mapped: { title: "Campo obbligatorio mancante", description: "Compila tutti i campi richiesti." } },
  { pattern: /foreign key violation/i,                       mapped: { title: "Riferimento non valido", description: "Il record collegato non esiste." } },
];

function extractMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (typeof e.error_description === "string") return e.error_description;
    if (typeof e.details === "string") return e.details;
    if (typeof e.hint === "string") return e.hint;
    if (e.error && typeof e.error === "string") return e.error;
  }
  return String(err ?? "Errore sconosciuto");
}

function extractCode(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.code === "string") return e.code;
    if (typeof e.error === "string") return e.error;
    if (typeof e.status === "number") return String(e.status);
  }
  return undefined;
}

/**
 * Returns a user-friendly error title (string).
 * Use `mapErrorFull()` to get both title and description.
 */
export function mapError(err: unknown): string {
  return mapErrorFull(err).title;
}

/**
 * Returns { title, description? } for rendering in toasts or alerts.
 */
export function mapErrorFull(err: unknown): MappedError {
  if (!err) return { title: "Errore sconosciuto" };

  const code = extractCode(err);
  const msg = extractMessage(err);

  // 1. Direct code match (Postgres / auth error codes)
  if (code) {
    const byCode = POSTGRES_ERROR_MAP[code];
    if (byCode) return byCode;

    // HTTP status code
    const status = parseInt(code);
    if (!isNaN(status) && HTTP_STATUS_MAP[status]) return HTTP_STATUS_MAP[status];
  }

  // 2. Message pattern match
  for (const { pattern, mapped } of NETWORK_PATTERNS) {
    if (pattern.test(msg)) return mapped;
  }

  // 3. Fallback: use the raw message but truncate for readability
  const truncated = msg.length > 120 ? msg.slice(0, 117) + "…" : msg;
  return { title: "Si è verificato un errore", description: truncated };
}

export type { MappedError };
