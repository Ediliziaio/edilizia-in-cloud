/**
 * fetchWithTimeout — wrapper resiliente per API esterne (S3-05/A).
 *
 * Aggiunge un timeout esplicito via AbortSignal.timeout, opzionalmente
 * combinato con un AbortSignal esterno (es. unmount React). In caso di
 * TimeoutError logga un breadcrumb Sentry tramite captureVelocityError.
 *
 * Pattern d'uso:
 *
 *   const resp = await fetchWithTimeout(url, {
 *     timeoutMs: 5_000,
 *     context: "geocoding.nominatim",
 *   });
 *
 * Per AI provider / OCR usare timeout maggiori (60_000+).
 */
import { captureVelocityError } from "@/lib/velocity/sentry";

export interface FetchWithTimeoutOptions extends RequestInit {
  /** Timeout in ms (default 8000). */
  timeoutMs?: number;
  /** Breadcrumb Sentry: identifica il chiamante (es. "geocoding.nominatim"). */
  context?: string;
}

/**
 * Combina più AbortSignal in uno solo. Fallback se AbortSignal.any
 * non è disponibile (browser molto vecchi / jsdom older).
 */
function combineSignals(signals: AbortSignal[]): AbortSignal {
  // AbortSignal.any è supportato dai browser moderni (2024+) e da Node 20+.
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") {
    return anyFn(signals);
  }
  // Fallback: il primo a fire vince.
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      return controller.signal;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

export async function fetchWithTimeout(
  url: string | URL,
  init: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = 8_000, context, signal: externalSignal, ...rest } = init;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = externalSignal
    ? combineSignals([externalSignal, timeoutSignal])
    : timeoutSignal;

  try {
    return await fetch(url, { ...rest, signal });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      captureVelocityError(context ?? "fetch.timeout", e, {
        url: String(url),
        timeoutMs,
      });
    }
    throw e;
  }
}
