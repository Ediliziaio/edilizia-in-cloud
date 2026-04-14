import { lazy, type ComponentType } from "react";

/**
 * Drop-in replacement for React.lazy() that handles chunk-load failures
 * gracefully during deploys.
 *
 * When Cloudflare Pages deploys a new version, old chunk files are removed.
 * If a user has the app open in a tab and navigates after a deploy, the old
 * JS tries to load a chunk with the old hash → 404 → "Failed to fetch
 * dynamically imported module".
 *
 * This wrapper:
 *  1. Tries the import once normally
 *  2. On failure, clears SW caches + sessionStorage flags
 *  3. Forces a full page reload with cache-bust so the fresh index.html
 *     (with correct chunk hashes) is loaded
 *
 * The reload happens at most once per session to prevent infinite loops.
 */
const RELOAD_KEY = "_lazy_chunk_reload";

export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (error: any) {
      const isChunkError =
        error?.name === "ChunkLoadError" ||
        error?.message?.includes("Failed to fetch dynamically imported module") ||
        error?.message?.includes("Importing a module script failed") ||
        error?.message?.includes("Unable to preload CSS") ||
        /Loading chunk \d+ failed/.test(error?.message ?? "");

      if (isChunkError && !sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, "1");

        // Nuke service workers and caches
        try {
          if ("serviceWorker" in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }
          if (typeof caches !== "undefined") {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch {
          // Best effort
        }

        // Full reload with cache-bust
        window.location.href =
          window.location.pathname +
          window.location.search +
          (window.location.search ? "&" : "?") +
          "_r=" +
          Date.now();

        // Return a never-resolving promise to prevent React from rendering
        // while the page reloads
        return new Promise<never>(() => {});
      }

      // Re-throw so ErrorBoundary can handle it
      throw error;
    }
  });
}
