import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => await import("pdf-lib"));
const modulePath = "../../../supabase/functions/_shared/fotovoltaicoPdfOriginale";
const { fotovoltaicoPdfOriginale } = await import(/* @vite-ignore */ modulePath);
const env: Record<string, string> = {};
const html = new TextEncoder().encode("<!doctype html><html>Preventivo QA</html>");
beforeEach(() => {
  env.PREVENTIVI_PDF_RENDER_URL = "http://127.0.0.1:8096/render";
  env.PREVENTIVI_PDF_TOKEN = "test-only-token";
  vi.stubGlobal("Deno", { env: { get: (k: string) => env[k] } });
});
afterEach(() => vi.unstubAllGlobals());

describe("FV: conversione del PDF originale prima della firma", () => {
  it("usa il servizio server autenticato e restituisce un PDF leggibile", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage([595, 842]);
    const bytes = await pdf.save();
    // `BodyInit` esclude i buffer condivisi: pdf-lib restituisce sempre un ArrayBuffer normale.
    const fetcher = vi.fn(async () => new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { "Content-Type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetcher);
    const result = await fotovoltaicoPdfOriginale(html);
    expect((await PDFDocument.load(result)).getPageCount()).toBe(1);
    expect(fetcher).toHaveBeenCalledWith(new URL(env.PREVENTIVI_PDF_RENDER_URL), expect.objectContaining({
      method: "POST", redirect: "error", headers: { Authorization: "Bearer test-only-token", "Content-Type": "application/json" },
      body: JSON.stringify({ html: new TextDecoder().decode(html) }),
    }));
  });
  it("senza configurazione si ferma, senza richieste esterne", async () => {
    delete env.PREVENTIVI_PDF_RENDER_URL;
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(fotovoltaicoPdfOriginale(html)).rejects.toThrow("non è configurata");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("non invia documenti o token su HTTP pubblico", async () => {
    env.PREVENTIVI_PDF_RENDER_URL = "http://example.test/render";
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(fotovoltaicoPdfOriginale(html)).rejects.toThrow("non valida");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["<html>errore</html>", "%PDF-1.4 rotto"])("non accetta una risposta corrotta (%s)", async invalid => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(invalid)));
    await expect(fotovoltaicoPdfOriginale(html)).rejects.toThrow();
  });
  it("un errore del servizio non diventa un successo di firma", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("offline", { status: 503 })));
    await expect(fotovoltaicoPdfOriginale(html)).rejects.toThrow("nessuna richiesta di firma");
  });
  it("rete o timeout danno un messaggio comprensibile senza dettagli delle credenziali", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("fetch failed"); }));
    await expect(fotovoltaicoPdfOriginale(html)).rejects.toThrow("non è raggiungibile o impiega troppo tempo");
  });
});
