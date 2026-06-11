import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

// Durante la finestra di propagazione di un deploy Cloudflare l'HTML nuovo può
// arrivare prima dei chunk → l'import dinamico fallisce. Chrome inoltre
// memoizza il fallimento nella memory cache del renderer: retry dello stesso
// URL, reload e perfino tab nuove dello stesso sito continuano a fallire
// (verificato live l'11/06/2026 su www.ediliziaincloud.com). L'unico bypass
// client-side è ri-importare lo STESSO chunk con una query diversa.
const RETRY_DELAYS_MS = [1200, 3500];

// Stessa chiave usata dall'ErrorBoundary per contare i reload automatici:
// un import riuscito = rete sana → si azzera il contatore, così un futuro
// chunk error riparte dai tentativi automatici invece del blocco manuale.
const CHUNK_RELOAD_KEY = "_chunk_err_reload_v2";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Chrome/Edge includono l'URL fallito nel messaggio ("Failed to fetch
// dynamically imported module: https://…/Pagina-Hash.js"); Safari/Firefox no
// → per loro si ritenta la factory originale, che non memoizza il fallimento.
function failedChunkUrl(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const match = msg.match(/https?:\/\/[^\s'")]+\.(?:js|mjs)/);
  return match ? match[0] : null;
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const bustUrl = attempt > 0 ? failedChunkUrl(lastError) : null;
        const mod = bustUrl
          ? ((await import(/* @vite-ignore */ `${bustUrl}${bustUrl.includes("?") ? "&" : "?"}v=${Date.now()}`)) as {
              default: T;
            })
          : await factory();
        try {
          sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        } catch {
          /* storage non disponibile: ignora */
        }
        return mod;
      } catch (e) {
        lastError = e;
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
    throw lastError;
  });
}
