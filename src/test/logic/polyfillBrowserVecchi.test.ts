import { describe, expect, it } from "vitest";
import { installaPolyfillBrowserVecchi } from "@/lib/polyfillBrowserVecchi";

describe("polyfillBrowserVecchi (Safari < 17.4)", () => {
  it("aggiunge Promise.withResolvers e Promise.try dove mancano", async () => {
    class FintaPromise<T> extends Promise<T> {}
    const P = FintaPromise as unknown as PromiseConstructor & Record<string, unknown>;
    Object.defineProperty(P, "withResolvers", { value: undefined, configurable: true, writable: true });
    Object.defineProperty(P, "try", { value: undefined, configurable: true, writable: true });
    installaPolyfillBrowserVecchi({ Promise: P } as unknown as typeof globalThis);

    const { promise, resolve } = (P.withResolvers as () => { promise: Promise<number>; resolve: (v: number) => void })();
    resolve(7);
    await expect(promise).resolves.toBe(7);
    await expect((P.try as (f: (a: number) => number, a: number) => Promise<number>)((a) => a * 2, 21)).resolves.toBe(42);
    await expect((P.try as (f: () => never) => Promise<never>)(() => { throw new Error("no"); })).rejects.toThrow("no");
  });

  it("non tocca i browser che le hanno già", () => {
    const prima = Promise.withResolvers;
    installaPolyfillBrowserVecchi();
    expect(Promise.withResolvers).toBe(prima);
  });
});
