import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from "pdf-lib";
import { bozzaVuota, misuraVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";
import { generaComputoPdf, generaDocumentoComputo } from "@/lib/computo/esportaComputo";
import { destinazioneVoceComputo } from "@/lib/computo/destinazioniPdf";
import { normalizzaFontPdf } from "@/lib/computo/compatibilitaFontPdf";
import { appendiAllegatiPdf } from "@/lib/computo/appendiAllegatiPdf";

function destinazioni(doc: PDFDocument) {
  const array = doc.catalog.lookup(PDFName.of("Names"), PDFDict).lookup(PDFName.of("Dests"), PDFDict).lookup(PDFName.of("Names"), PDFArray);
  const result = new Map<string, { page: number; top: number }>();
  for (let k = 0; k < array.size(); k += 2) {
    const target = array.lookup(k + 1, PDFArray);
    result.set(array.lookup(k, PDFString).decodeText(), {
      page: doc.getPages().findIndex(p => p.ref.toString() === target.get(0).toString()) + 1,
      top: target.lookup(3, PDFNumber).asNumber(),
    });
  }
  return result;
}
const bozza = () => ({ ...bozzaVuota(), voci: [
  { ...voceVuota(), id: "primo", numero: "101", descrizione: "Descrizione uguale", quantita: "2", prezzo: "10" },
  { ...voceVuota(), id: "secondo (con spazi)", numero: "101", descrizione: "Descrizione uguale", quantita: "3", prezzo: "20" },
] });

describe("destinazioni native delle voci di computo", () => {
  it.each(["editoriale", "primus", "elenco-prezzi"] as const)("identifica voci con descrizione e numero uguali nel formato %s", async impaginazione => {
    const pdf = await generaDocumentoComputo(vociDaBozza(bozza()), { titolo: "Computo", impaginazione });
    const doc = await PDFDocument.load(await pdf.arrayBuffer());
    const map = destinazioni(doc);
    expect(map.size).toBe(2);
    const a = map.get(destinazioneVoceComputo("primo"))!, b = map.get(destinazioneVoceComputo("secondo (con spazi)"))!;
    expect(a.page).toBeGreaterThan(0); expect(b.page).toBeGreaterThanOrEqual(a.page);
    expect(a.top).toBeGreaterThan(b.top); expect(a.top).toBeLessThan(doc.getPage(a.page - 1).getHeight());
  });
  it("ricalcola la pagina reale dopo una modifica delle voci precedenti", async () => {
    const b = bozza();
    const prima = await generaComputoPdf(vociDaBozza(b), { titolo: "Computo", impaginazione: "editoriale" });
    const p1 = destinazioni(await PDFDocument.load(prima.output("arraybuffer"))).get(destinazioneVoceComputo(b.voci[1].id))!;
    b.voci[0].descrizione = "Descrizione lunga completa della lavorazione. ".repeat(230);
    const dopo = await generaComputoPdf(vociDaBozza(b), { titolo: "Computo", impaginazione: "editoriale" });
    const map = destinazioni(await PDFDocument.load(dopo.output("arraybuffer")));
    expect(map.get(destinazioneVoceComputo(b.voci[1].id))!.page).toBeGreaterThan(p1.page);
    expect(map.get(destinazioneVoceComputo(b.voci[0].id))!.page).toBe(2);
    expect(map.size).toBe(2);
  });
  it("conserva la prima pagina delle voci multipagina attraverso normalizzazione e allegati", async () => {
    const b = bozza(); b.voci[0].misure = Array.from({ length: 100 }, (_, n) => ({ ...misuraVuota(), descrizione: `Misura ${n + 1}`, formula: "2" }));
    const pdf = await generaComputoPdf(vociDaBozza(b), { titolo: "Computo", impaginazione: "editoriale", dettaglioMisure: true });
    const before = destinazioni(await PDFDocument.load(pdf.output("arraybuffer")));
    const normalizzato = await normalizzaFontPdf(pdf.output("arraybuffer"));
    const allegato = await PDFDocument.create(); allegato.addPage().drawText("Tavola di prova");
    const finale = await appendiAllegatiPdf(await normalizzato.arrayBuffer(), [{ nome: "Tavola", tipo: "planimetria", blob: new Blob([Uint8Array.from(await allegato.save()).buffer], { type: "application/pdf" }) }]);
    const after = destinazioni(await PDFDocument.load(await finale.arrayBuffer()));
    expect(after).toEqual(before); expect(after.get(destinazioneVoceComputo("primo"))!.page).toBe(2);
  });
});
