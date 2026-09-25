import { Suspense } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { failedChunkUrl, lazyWithRetry, retryChunkUrl } from "@/lib/lazyWithRetry";

afterEach(() => { cleanup(); sessionStorage.clear(); });

describe("recupero caricamento pagine", () => {
  it.each(["SettingsTariffe.tsx", "presets.ts", "Pagina.js", "Pagina.mjs", "Pagina.jsx"])("riconosce %s", (file) => {
    const url = `${window.location.origin}/src/${file}?t=123`;
    expect(failedChunkUrl(new Error(`Failed to fetch dynamically imported module: ${url}`))).toBe(url);
  });
  it("non importa indirizzi esterni o risorse non JavaScript", () => {
    expect(failedChunkUrl(new Error("Failed: https://other.example/file.js"))).toBeNull();
    expect(failedChunkUrl(new Error(`Failed: ${window.location.origin}/file.html`))).toBeNull();
    expect(failedChunkUrl(new Error("Importing a module script failed"))).toBeNull();
  });
  it("conserva la versione Vite e inserisce il retry prima del frammento", () => {
    const url = retryChunkUrl(`${window.location.origin}/file.tsx?v=abc#page`, 123);
    expect(new URL(url).searchParams.get("v")).toBe("abc");
    expect(new URL(url).searchParams.get("__chunk_retry")).toBe("123");
    expect(new URL(url).hash).toBe("#page");
  });
  it("un layout caricato non azzera i tentativi della pagina in errore", async () => {
    const prior = JSON.stringify({ count: 3, firstAt: Date.now() });
    sessionStorage.setItem("_chunk_err_reload_v2", prior);
    const Layout = lazyWithRetry(async () => ({ default: () => <p>Layout caricato</p> }));
    render(<Suspense fallback="Attendi"><Layout /></Suspense>);
    expect(await screen.findByText("Layout caricato")).toBeTruthy();
    expect(sessionStorage.getItem("_chunk_err_reload_v2")).toBe(prior);
  });
});
