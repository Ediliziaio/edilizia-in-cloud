// fetchWithRetry — wrapper resiliente per le chiamate HTTP dirette alle API AI
// esterne (OpenRouter / OpenAI / Anthropic) fatte FUORI dal router centrale.
//
// Aggiunge ciò che a quelle chiamate grezze manca:
//   - timeout esplicito (AbortController) → niente attese infinite su rete lenta
//   - retry con backoff SOLO su errori transitori: timeout, rete, HTTP 429, 5xx
//   - rispetto dell'header Retry-After quando presente
//
// NON ritenta i 4xx ≠ 429 (input/config errati: inutile insistere) e NON cambia
// la request: stessa URL, stesso body. È un drop-in per `fetch(...)`.

export interface FetchRetryOpts {
  /** Timeout per singolo tentativo, ms. Default 30000 (60000+ per immagini). */
  timeoutMs?: number;
  /** Tentativi AGGIUNTIVI oltre il primo. Default 2. */
  retries?: number;
  /** Etichetta per i log diagnostici. */
  label?: string;
}

export async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
  opts: FetchRetryOpts = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxRetries = Math.max(0, opts.retries ?? 2);
  const tag = opts.label ? ` [${opts.label}]` : "";
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timer);

      // Errori transitori → ritenta (se restano tentativi)
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after")) || 0;
        const backoff = retryAfter > 0
          ? retryAfter * 1000
          : 500 * (attempt + 1) + Math.floor(Math.random() * 300);
        // libera il body non consumato prima di ritentare (evita leak in Deno)
        try { await res.body?.cancel(); } catch { /* noop */ }
        console.warn(`[fetchWithRetry]${tag} HTTP ${res.status}, retry ${attempt + 1}/${maxRetries} tra ${backoff}ms`);
        await sleep(Math.min(backoff, 8000));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const isAbort = e instanceof DOMException && e.name === "AbortError";
      if (attempt < maxRetries) {
        const backoff = 500 * (attempt + 1) + Math.floor(Math.random() * 300);
        console.warn(`[fetchWithRetry]${tag} ${isAbort ? "timeout" : "errore rete"}, retry ${attempt + 1}/${maxRetries} tra ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`fetchWithRetry${tag} fallito dopo ${maxRetries + 1} tentativi`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
