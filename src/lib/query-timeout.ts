export const DEFAULT_QUERY_TIMEOUT_MS = 12_000;

export function createTimeoutSignal(timeoutMs = DEFAULT_QUERY_TIMEOUT_MS, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  const timeoutId = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);

  if (parentSignal) {
    if (parentSignal.aborted) {
      abortFromParent();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

/**
 * Retry policy per query LISTA al primo load. Il default globale (App.tsx)
 * considera i timeout non-retriabili: giusto per i refresh in background
 * (i dati cached restano a schermo), sbagliato al primo caricamento di una
 * lista — un timeout transitorio (DB cold, N query concorrenti al mount)
 * mostrava subito l'errore "Riprova" dopo 12s, e il retry manuale poi
 * andava in 1-2s. Qui: timeout/abort → UN retry automatico; errori
 * auth/4xx → mai; resto → come la policy globale (2 retry).
 */
export function retryListQuery(failureCount: number, error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (/jwt|permission|not authorized|unauthorized|forbidden|401|403|404/.test(message)) return false;
  if (message.includes("timeout") || message.includes("abort")) return failureCount < 1;
  return failureCount < 2;
}

export function withClientTimeout<T>(
  task: PromiseLike<T>,
  label = "Richiesta",
  timeoutMs = DEFAULT_QUERY_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label}: timeout dopo ${Math.round(timeoutMs / 1000)} secondi`));
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(task), timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}
