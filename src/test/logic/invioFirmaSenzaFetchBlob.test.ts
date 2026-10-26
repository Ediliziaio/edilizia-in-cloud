/**
 * «Invia per la firma» dei preventivatori edili (26/10/2026): il PDF per l'invio si leggeva con `fetch(blob:...)`, che la
 * sicurezza del sito (connect-src, senza blob:) vieta. Il browser rispondeva «Load failed» (Safari) e il preventivo
 * non partiva: una cliente di Dimora Torino con la ristrutturazione completa da 59.805 €. Ora il file si prende dalla
 * memoria, senza richieste di rete.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPdfPreviewUrl, readPdfPreviewBlob, revokePdfPreviewUrl } from "@/lib/pdfPreviewSource";

const radice = process.cwd();
const leggi = (f: string) => readFileSync(resolve(radice, f), "utf8");

afterEach(() => vi.restoreAllMocks());

describe("readPdfPreviewBlob", () => {
  it("ridà il file dell'anteprima dalla memoria, senza chiamare fetch", async () => {
    const fetchSpia = vi.fn();
    vi.stubGlobal("fetch", fetchSpia);
    const creaUrl = vi.fn(() => "blob:http://localhost/abc");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: creaUrl, revokeObjectURL: vi.fn() }));
    const file = new Blob(["%PDF-1.7"], { type: "application/pdf" });
    const url = createPdfPreviewUrl(file);
    expect(await readPdfPreviewBlob(url)).toBe(file);
    expect(fetchSpia).not.toHaveBeenCalled();
    revokePdfPreviewUrl(url);
    vi.unstubAllGlobals();
  });

  it("per un indirizzo che non è un'anteprima legge dalla rete, e un errore HTTP si dice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 404 })));
    await expect(readPdfPreviewBlob("https://esempio.test/a.pdf")).rejects.toThrow("PDF non disponibile (404)");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("pdf", { status: 200 })));
    expect(await (await readPdfPreviewBlob("https://esempio.test/b.pdf")).text()).toBe("pdf");
    vi.unstubAllGlobals();
  });
});

describe("i preventivatori edili", () => {
  const passi = readdirSync(resolve(radice, "src/pages/azienda"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join("src/pages/azienda", d.name))
    .flatMap((d) => readdirSync(resolve(radice, d), { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.endsWith("Wizard")).map((e) => join(d, e.name, "StepPdf.tsx")))
    .filter((f) => { try { readFileSync(resolve(radice, f)); return true; } catch { return false; } });

  it("sono otto e nessuno legge il PDF con fetch su un indirizzo blob:", () => {
    expect(passi.length).toBeGreaterThanOrEqual(8);
    for (const f of passi) {
      const t = leggi(f);
      expect(t, f).not.toMatch(/fetch\(url\)\)\.blob\(\)/);
      if (t.includes("generaPdfBlob")) expect(t, f).toContain("readPdfPreviewBlob(url)");
    }
  });

  it("la sicurezza del sito non ammette blob: nelle richieste: per questo il file non si può «scaricare» da sé", () => {
    const riga = leggi("public/_headers").split("\n").find((l) => l.includes("Content-Security-Policy")) ?? "";
    const connect = riga.split(";").find((p) => p.trim().startsWith("connect-src")) ?? "";
    expect(connect).not.toContain("blob:");
  });
});
