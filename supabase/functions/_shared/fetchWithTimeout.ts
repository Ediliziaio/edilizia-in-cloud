/**
 * P2-5: fetch con timeout configurabile.
 *
 * Lancia DOMException('TimeoutError') se il server non risponde entro
 * `timeoutMs`. Rispetta anche un AbortSignal esterno (opzionale).
 *
 * Default: 30s (adatto a maggior parte di LLM/API esterne).
 * Override tipici:
 *   - embeddings batch → 60s
 *   - LLM call lunga   → 60-90s
 *   - fetch asset/PDF  → 20s
 *   - Stripe / webhook → 30s
 */
export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  url: string | URL,
  init: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = 30_000, signal: externalSignal, ...rest } = init;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(
      new DOMException(
        `Request to ${String(url)} timed out after ${timeoutMs}ms`,
        "TimeoutError",
      ),
    ),
    timeoutMs,
  );

  // Collega anche un eventuale AbortSignal esterno.
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw externalSignal.reason ?? new DOMException("Aborted", "AbortError");
    }
    externalSignal.addEventListener(
      "abort",
      () => controller.abort(externalSignal.reason),
      { once: true },
    );
  }

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * P2-5: fetch con retry esponenziale + timeout.
 * Ritenta su errori di rete e status 5xx; NON ritenta su 4xx (errore
 * cliente / input non valido).
 */
export async function fetchWithRetryAndTimeout(
  url: string | URL,
  init: FetchWithTimeoutOptions = {},
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init);
      if (res.status < 500) return res; // 2xx/3xx/4xx: nessun retry
      lastErr = new Error(`Server error ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Tipo-guard per identificare un timeout scatenato da fetchWithTimeout.
 * Uso tipico nel chiamante:
 *   } catch (err) {
 *     if (isTimeoutError(err)) return jsonResponse({error:"..."}, 504);
 *     throw err;
 *   }
 */
export function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "TimeoutError";
}
