const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const chatPath = '/functions/v1/ai-preventivo-conversazione';

/** Trusted app configuration only; remote traffic requires HTTPS. */
export function configuredQuoteEndpoint(backendUrl: string): URL {
  let url: URL;
  try { url = new URL(backendUrl); }
  catch { throw new Error('Configurazione backend AI non valida. Nessuna credenziale inviata.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback.has(url.hostname))) {
    throw new Error('Configurazione backend AI non valida. Nessuna credenziale inviata.');
  }
  url.pathname = chatPath;
  return url;
}

/** The development proxy cannot silently fall back to production. */
export function localQuoteEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !loopback.has(url.hostname) || url.username || url.password
    || url.search || url.hash || url.pathname !== chatPath) {
    throw new Error('Il laboratorio può collegarsi solo all’endpoint AI locale dedicato.');
  }
  return url;
}

/** Bound allocation before decoding JSON, including failed responses. */
export async function quoteResponseText(response: Response, limit: number, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const reader = response.body?.getReader();
  if (!reader) return '';
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  let text = '', bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error('Risposta AI troppo grande. Bozza invariata.');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
