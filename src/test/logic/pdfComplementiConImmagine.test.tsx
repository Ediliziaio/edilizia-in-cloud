/**
 * I complementi nell'Allegato tecnico del preventivo (tapparelle, persiane, zanzariere, cassonetti): miniatura a sinistra
 * (foto del listino o disegno della persiana), voce, scelte e la finestra a cui sono legati. Renderer vero, offline.
 */
import { describe, expect, it, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";
import { SerramentoPDF } from "@/components/serramenti/SerramentoPDF";
import { pezziAllegato, impagina, UTILE_PAGINA } from "@/components/serramenti/impaginaSerramento";

vi.mock("@/lib/storage/immaginiModelloPdf", () => ({ CAMPI_IMMAGINE_SERRAMENTI: [], firmaImmagine: async (v: unknown) => v, firmaImmaginiModello: async (v: unknown) => v }));
vi.mock("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: () => { throw new Error("No network in PDF QA"); } }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url || url.startsWith("data:")) return url;
  if (url.startsWith(window.location.origin + "/")) url = new URL(url).pathname;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  const bytes = await readFile(path.resolve("public", url.slice(1)));
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
} }));


describe("complementi con immagine nel PDF", () => {
  it("la stima dell'altezza conta la miniatura: una riga con immagine non è più bassa di 18,5 + 44", () => {
    const senza = pezziAllegato([], [{ descrizione: "Tapparella", scelte: null }]).at(-1)!.alto;
    const con = pezziAllegato([], [{ descrizione: "Tapparella", scelte: null, immagine: true }]).at(-1)!.alto;
    expect(con).toBeGreaterThanOrEqual(18.5 + 44);
    expect(con).toBeGreaterThan(senza);
    expect(impagina([{ alto: 10 }], UTILE_PAGINA).fogli).toBe(1);
  });

  it("renderizza una tapparella con foto e una persiana, legate alla loro finestra", async () => {
    const template = createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: "Impresa esempio" }, "finestre");
    const dati = await buildMockPdfData({ template, moduleId: "finestre", companyName: "Impresa esempio" });
    const finestra = dati.detail.serramenti[0];
    const base = { progetto_id: dati.detail.progetto.id, company_id: "demo-company", position: 0, quantita: 1, prezzo_unitario: 252, prezzo_totale: 252, listino_voce_id: null as string | null, note: null as string | null, posa_esclusa: false } as const;
    dati.detail.accessori = [
      { ...base, id: "a1", tipo: "tapparella", descrizione: "Tapparella Alluminio Coibentata", larghezza_mm: 1200, altezza_mm: 1400, serramento_id: finestra.id, family_id: "fam-tapp", valori_assi: {}, scelte_assi: {} },
      { ...base, id: "a2", tipo: "zanzariera", descrizione: "Zanzariera a molla", larghezza_mm: 1200, altezza_mm: 1400, serramento_id: finestra.id, family_id: "fam-nofoto", valori_assi: {}, scelte_assi: {} },
    ] as unknown as typeof dati.detail.accessori;
    // (Con FOTO_PROVA=un.jpg si vede nel PDF: i PNG nel renderer di prova escono con il flusso rovinato.)
    const foto = process.env.FOTO_PROVA
      ? `data:image/jpeg;base64,${(await readFile(process.env.FOTO_PROVA)).toString("base64")}`
      : `data:image/png;base64,${(await readFile(path.resolve("public/templates/serramenti/cassonetto-pvc-isolato.png"))).toString("base64")}`;
    const accessoriFamilies = { "fam-tapp": { immagine_url: foto as string | null, disegno_tipologia: null as string | null }, "fam-nofoto": { immagine_url: null as string | null, disegno_tipologia: null as string | null } };
    const bytes = await renderToBuffer(SerramentoPDF({ ...dati, accessoriFamilies }) as Parameters<typeof renderToBuffer>[0]);
    if (process.env.DUMP_PDF) await writeFile(process.env.DUMP_PDF, bytes);
    const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    let testo = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const pagina = await doc.getPage(i);
      testo += (await pagina.getTextContent()).items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
    }
    expect(testo).toContain("Tapparella Alluminio Coibentata");
    expect(testo).toContain("Per: ");
  }, 120000);
});
