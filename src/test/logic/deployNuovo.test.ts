import { describe, expect, it } from "vitest";
import { deployNuovo, scriptPrincipale } from "@/lib/deployNuovo";

const html = (hash: string) => `<!doctype html><html><head><script type="module" crossorigin src="/assets/index-${hash}.js"></script></head><body></body></html>`;
const risposta = (corpo: string, ok = true) => (async () => ({ ok, text: async () => corpo })) as unknown as typeof fetch;

describe("deployNuovo", () => {
  it("legge lo script principale", () => {
    expect(scriptPrincipale(html("AbC123"))).toBe("/assets/index-AbC123.js");
    expect(scriptPrincipale("<html></html>")).toBeNull();
  });
  it("stessa versione online: non si ricarica (modulo rotto su questo browser)", async () => {
    expect(await deployNuovo(risposta(html("aaa")), "/assets/index-aaa.js")).toBe(false);
  });
  it("versione nuova online: si ricarica", async () => {
    expect(await deployNuovo(risposta(html("bbb")), "/assets/index-aaa.js")).toBe(true);
  });
  it("senza rete o risposta strana: non si ricarica", async () => {
    expect(await deployNuovo((async () => { throw new TypeError("Load failed"); }) as unknown as typeof fetch, "/assets/index-aaa.js")).toBe(false);
    expect(await deployNuovo(risposta("", false), "/assets/index-aaa.js")).toBe(false);
  });
  it("in sviluppo (nessun hash) si ricarica come prima", async () => {
    expect(await deployNuovo(risposta(""), null)).toBe(true);
  });
});

describe("deployNuovo: cartella degli asset con suffisso", () => {
  it("riconosce /assets-cb3/index-…", () => {
    expect(scriptPrincipale('<script type="module" crossorigin src="/assets-cb3/index-DhodoIQa.js"></script>')).toBe("/assets-cb3/index-DhodoIQa.js");
  });
});
