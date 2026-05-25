/**
 * retryWithBackoff — riprova una funzione async con backoff esponenziale.
 * Pensato per chiamate di rete transienti (storage, RPC, fetch).
 *
 * Uso tipico:
 *   const { data, error } = await retryWithBackoff(
 *     () => supabase.storage.from("docs").createSignedUrl(path, 3600),
 *     { maxAttempts: 3 },
 *   );
 *
 * Default: 3 tentativi (500ms → 2000ms → 8000ms).
 *
 * Si ferma immediatamente se la funzione lancia un'eccezione non retriable
 * (passare `shouldRetry` per controllare). Per Supabase, di default consideriamo
 * retriable: timeout, 5xx, errori di rete generici. NON retry su 401/403/404.
 */

export interface RetryOptions {
  /** Max tentativi totali (incluso il primo). Default 3. */
  maxAttempts?: number;
  /** Delay base in ms; ogni attempt moltiplica per 4x. Default 500. */
  baseDelayMs?: number;
  /** Massimo delay tra attempt in ms. Default 8000. */
  maxDelayMs?: number;
  /** Decide se ritentare in base all'errore lanciato. Default: retry su tutto tranne 401/403/404. */
  shouldRetry?: (error: unknown) => boolean;
  /** Hook opzionale chiamato prima di ogni retry (per logging). */
  onRetry?: (attempt: number, error: unknown, nextDelayMs: number) => void;
}

const DEFAULT_NON_RETRIABLE_STATUS = new Set([400, 401, 403, 404, 422]);

function defaultShouldRetry(error: unknown): boolean {
  if (!error) return false;
  const e = error as { status?: number; statusCode?: number; code?: string };
  const status = e.status ?? e.statusCode;
  if (typeof status === "number" && DEFAULT_NON_RETRIABLE_STATUS.has(status)) return false;
  // Supabase storage errors a volte arrivano come { error: "...", statusCode: "404" }
  if (typeof e.code === "string" && (e.code === "PGRST116" || e.code.startsWith("4"))) return false;
  return true;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error)) throw error;
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(4, attempt - 1));
      onRetry?.(attempt, error, delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // Unreachable: il loop sopra o ritorna o throwa. Safeguard TS.
  throw lastError;
}
