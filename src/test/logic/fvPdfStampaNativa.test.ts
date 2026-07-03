/**
 * "Scarica PDF" del preventivo FV = stampa NATIVA del browser.
 *
 * Il PDF scaricato deve essere IDENTICO all'anteprima: entrambi devono passare
 * dallo stesso motore di rendering. La vecchia pipeline html2canvas+jsPDF
 * produceva un raster diverso (gradienti/backdrop-filter persi, letter-spacing
 * sbagliato, pagine oltre 297mm schiacciate, testo non selezionabile).
 * Questi test bloccano una regressione verso quella pipeline.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LIB = resolve(__dirname, "../../lib/fotovoltaico/htmlToPdf.ts");
const PAGE = resolve(
  __dirname,
  "../../pages/azienda/fotovoltaico/FotovoltaicoDettaglio.tsx",
);

describe("FV PDF — stampa nativa (fedeltà anteprima)", () => {
  it("htmlToPdf espone stampaPreventivoNativo e usa window.print del browser", () => {
    const src = readFileSync(LIB, "utf8");
    expect(src).toContain("export async function stampaPreventivoNativo");
    expect(src).toContain("win.print()");
    // Aspetta font e immagini prima di stampare (niente placeholder nel PDF).
    expect(src).toContain("fonts?.ready");
    expect(src).toContain("afterprint");
  });

  it("htmlToPdf NON usa più la pipeline raster html2canvas/jsPDF", () => {
    const src = readFileSync(LIB, "utf8");
    expect(src).not.toContain('import("html2canvas")');
    expect(src).not.toContain('import("jspdf")');
    expect(src).not.toContain("toDataURL");
  });

  it("FotovoltaicoDettaglio usa la stampa nativa per Scarica PDF", () => {
    const src = readFileSync(PAGE, "utf8");
    expect(src).toContain("stampaPreventivoNativo");
    expect(src).not.toContain("scaricaPreventivoComePdf");
    // Copy onesta: spiega il passaggio "Salva come PDF".
    expect(src).toContain("Salva come PDF");
  });
});
