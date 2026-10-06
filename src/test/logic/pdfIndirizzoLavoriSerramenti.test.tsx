/**
 * Il PDF dei serramenti scrive la riga «Cantiere» quando i lavori sono davvero altrove (06/10/2026): si confronta
 * tutto l'indirizzo (via, città, CAP, provincia), non solo la via. Prima, stessa via in un'altra città (o la città
 * cambiata e la via lasciata uguale) faceva sparire il cantiere dal documento. Renderer vero, offline.
 */
import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";
import { SerramentoPDF } from "@/components/serramenti/SerramentoPDF";

vi.mock("@/lib/storage/immaginiModelloPdf", () => ({ CAMPI_IMMAGINE_SERRAMENTI: [], firmaImmagine: async (v: unknown) => v, firmaImmaginiModello: async (v: unknown) => v }));
vi.mock("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: () => { throw new Error("No network in PDF QA"); } }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url || url.startsWith("data:")) return url;
  if (url.startsWith(window.location.origin + "/")) url = new URL(url).pathname;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  const bytes = await readFile(path.resolve("public", url.slice(1)));
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
} }));

/** Il testo del PDF, come lo legge il cliente. */
async function testoDelPdf(cantiere: Partial<Record<"indirizzo" | "citta" | "cap" | "provincia" | "piano", string | null>>): Promise<string> {
  const template = createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: "Impresa esempio" }, "finestre");
  const dati = await buildMockPdfData({ template, moduleId: "finestre", companyName: "Impresa esempio" });
  // Il cliente del documento di prova: «Via Roma 12, 20100 Milano (MI)», lavori allo stesso indirizzo, 2° piano.
  Object.assign(dati.detail.progetto, {
    cantiere_indirizzo: cantiere.indirizzo ?? "Via Roma 12", cantiere_citta: cantiere.citta ?? "Milano",
    cantiere_cap: cantiere.cap ?? "20100", cantiere_provincia: cantiere.provincia ?? "MI",
    ...(cantiere.piano !== undefined ? { cantiere_piano: cantiere.piano } : {}),
  });
  const bytes = await renderToBuffer(SerramentoPDF(dati) as Parameters<typeof renderToBuffer>[0]);
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let testo = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    testo += (await pagina.getTextContent()).items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
  }
  return testo.replace(/\s+/g, " ");
}

describe("riga «Cantiere» nel PDF dei serramenti", () => {
  // Nel documento di prova i lavori stanno al 2° piano: la riga «Cantiere» dell'anagrafica è «via, città · 2° piano».
  // (In copertina c'è sempre «CANTIERE: via, città»: non è quella la riga di cui si parla.)
  // Si confrontano booleani, non il testo intero: se fallisce, il messaggio resta leggibile.
  it("stesso indirizzo del cliente: nessuna riga «Cantiere» nell'anagrafica", async () => {
    const testo = await testoDelPdf({});
    expect(testo.includes("Mario Rossi"), "il documento c'è").toBe(true);
    expect(testo.includes("Milano · 2° piano"), "riga «Cantiere» ripetuta").toBe(false);
  }, 180_000);

  it("stessa via ma un'altra città: la riga «Cantiere» c'è (prima il cantiere spariva dall'anagrafica)", async () => {
    const testo = await testoDelPdf({ citta: "Torino", cap: "10121", provincia: "TO" });
    expect(testo.includes("Via Roma 12, Torino · 2° piano")).toBe(true);
  }, 180_000);

  it("un'altra via nella stessa città: la riga c'è, come prima", async () => {
    const testo = await testoDelPdf({ indirizzo: "Via Garibaldi 8" });
    expect(testo.includes("Via Garibaldi 8, Milano · 2° piano")).toBe(true);
  }, 180_000);
});
