import { normalizeFvPdfPagesOrder } from "../../lib/fotovoltaico/pdfPages";
import { describe, expect, it } from "vitest";
import { analisiNelPdfFv, conAnalisiNelPdfFv } from "../../lib/fotovoltaico/analisiNelPdf";
describe("Analisi energetica nel singolo preventivo", () => {
  it("include consumi e risparmio senza cambiare ordine, colori o pagine escluse", () => {
    const originale = { colore_primario: "#123456", pdf_pages_order: normalizeFvPdfPagesOrder([{ id: "componenti", visible: true }, { id: "risparmio", visible: false }, { id: "flussi", visible: false }, { id: "produzione", visible: false }, { id: "recensioni", visible: false }]) };
    const prima = JSON.stringify(originale), dopo = conAnalisiNelPdfFv(originale, true);
    expect(analisiNelPdfFv(dopo)).toBe(true);
    expect(dopo.pdf_pages_order.map(p => p.id)).toEqual(originale.pdf_pages_order.map(p => p.id));
    expect(dopo.pdf_pages_order.find(p => p.id === "recensioni")?.visible).toBe(false);
    expect(dopo.colore_primario).toBe(originale.colore_primario);
    expect(JSON.stringify(originale)).toBe(prima);
    expect(analisiNelPdfFv(conAnalisiNelPdfFv(dopo, false))).toBe(false);
  });
});
