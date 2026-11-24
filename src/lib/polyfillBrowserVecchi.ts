/**
 * Funzioni recenti che pdfjs-dist 6 usa e Safari < 17.4 / < 18.2 non ha (24/11/2026, Renova Solution su Safari 17.3).
 * Senza, `import("pdfjs-dist")` falliva, Vite lo prendeva per un aggiornamento e ricaricava la pagina: il
 * documento appena caricato nella commessa non veniva mai registrato. La build legacy di pdfjs (alias in
 * vite.config) copre il resto; queste mancano anche lì. Si caricano per prime in main.tsx e non toccano
 * i browser che le hanno già.
 */

type ConResolvers = PromiseConstructor & {
  withResolvers?: <T>() => { promise: Promise<T>; resolve: (v: T | PromiseLike<T>) => void; reject: (e?: unknown) => void };
  try?: <T>(fn: (...a: unknown[]) => T | PromiseLike<T>, ...args: unknown[]) => Promise<T>;
};

export function installaPolyfillBrowserVecchi(g: typeof globalThis = globalThis): void {
  const P = g.Promise as ConResolvers;
  if (typeof P.withResolvers !== "function") {
    Object.defineProperty(P, "withResolvers", {
      configurable: true, writable: true,
      value: function withResolvers<T>() {
        let resolve!: (v: T | PromiseLike<T>) => void;
        let reject!: (e?: unknown) => void;
        const promise = new P<T>((res, rej) => { resolve = res; reject = rej; });
        return { promise, resolve, reject };
      },
    });
  }
  if (typeof P.try !== "function") {
    Object.defineProperty(P, "try", {
      configurable: true, writable: true,
      value: function promiseTry<T>(fn: (...a: unknown[]) => T | PromiseLike<T>, ...args: unknown[]) {
        return new P<T>((res) => res(fn(...args)));
      },
    });
  }
}

installaPolyfillBrowserVecchi();
