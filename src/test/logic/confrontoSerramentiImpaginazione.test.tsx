import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ConfrontoInterventoPdf } from "@/components/serramenti/AnalisiInterventoPdf";
import { nuovaAnalisiIntervento, SCENARI_ESISTENTI, OBIETTIVI_INFISSI, type AnalisiIntervento } from "@/lib/serramenti/analisiIntervento";

beforeAll(() => vi.stubGlobal("Uint8Array", Object.getPrototypeOf(Buffer.prototype).constructor));
afterAll(() => vi.unstubAllGlobals());

async function pagine(analisi: AnalisiIntervento) {
  const bytes = await renderToBuffer(<Document><Page size="A4" style={{ padding: 44 }}>
    <ConfrontoInterventoPdf analisi={analisi} materiale="pvc" prodotto="Sistema selezionato" colore="#183D42" />
  </Page></Document>);
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const texts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = content.items.filter(x => "str" in x);
      for (const item of items) {
        if (!("str" in item) || !item.str.trim()) continue;
        // PDF coordinates start at the bottom. Keep all text clear of page edges.
        expect(item.transform[5], item.str).toBeGreaterThanOrEqual(40);
        expect(item.transform[5] + item.height, item.str).toBeLessThanOrEqual(page.view[3] - 39);
      }
      texts.push(items.map(x => "str" in x ? x.str : "").join(" "));
    }
    return texts;
  } finally { await task.destroy(); }
}

describe("Impaginazione del confronto usato da originali e copie serramenti", () => {
  it.each(["alluminio_freddo", "legno", "pvc", "altro"] as const)("%s: confronto standard completo su un foglio anche senza immagini o Uw", async esistente => {
    const a = { ...nuovaAnalisiIntervento(), esistente, problemi: ["freddo", "rumore"] as AnalisiIntervento["problemi"] };
    const pages = await pagine(a);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain(SCENARI_ESISTENTI[esistente].nome);
    expect(pages[0]).toContain("Modelli, aperture e finiture");
    expect(pages[0]).toContain("CONFRONTO QUALITATIVO");
    expect(pages[0]).toContain("Nessuna eliminazione automatica");
    expect(pages[0]).not.toContain("Immagine illustrativa generata");
    expect(pages[0]).not.toContain("Uw inferiore");
  });

  it("note e fonti lunghe vanno a capo senza tagli e senza perdere gli obiettivi", async () => {
    const a = nuovaAnalisiIntervento();
    Object.assign(a, { esistente: "legno", uwPrima: 4, uwDopo: 1.2,
      fontePrima: "Fonte documentata prima. ".repeat(11) + "FINE PRIMA",
      fonteDopo: "Fonte documentata dopo. ".repeat(11) + "FINE DOPO",
      noteRilievo: "Nota rilevata sul posto. ".repeat(47) + "FINE RILIEVO",
      problemi: ["freddo", "spifferi", "rumore", "manutenzione", "apertura"] });
    const pages = await pagine(a);
    const text = pages.join(" ");
    expect(pages.length).toBeGreaterThan(1);
    for (const marker of ["FINE PRIMA", "FINE DOPO", "FINE RILIEVO", "Uw inferiore del 70%", "Nessuna eliminazione automatica"])
      expect(text).toContain(marker);
    for (const obiettivo of Object.values(OBIETTIVI_INFISSI)) expect(text).toContain(obiettivo);
    expect(pages.every(p => p.trim().length > 120)).toBe(true);
  });
});
