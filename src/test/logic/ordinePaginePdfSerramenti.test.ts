import { describe, expect, it } from "vitest";
import { normalizePdfPagesOrder, SR_PDF_PAGES_DEFAULT, type SrPdfPageOrderItem } from "@/types/serramenti";

/**
 * Regole decise il 14/09/2026: le pagine con le immagini dei prodotti vengono
 * prima dell'allegato tecnico, e la proposta economica subito dopo l'allegato,
 * per ogni azienda e qualunque ordine abbia salvato.
 */
const ids = (pagine: SrPdfPageOrderItem[]) => pagine.map((p) => p.id);
const salvato = (lista: string[]): SrPdfPageOrderItem[] =>
  lista.map((id) => ({ id: id as SrPdfPageOrderItem["id"], visible: true }));
const PRODOTTI: SrPdfPageOrderItem["id"][] = ["macro_dedicate", "linee_dedicate", "render", "articoli_dedicati"];

describe("Ordine delle pagine del PDF serramenti", () => {
  it("di default i prodotti vengono prima dell'allegato e la proposta economica subito dopo", () => {
    const ordine = ids(normalizePdfPagesOrder(null));
    const allegato = ordine.indexOf("allegato_tecnico");
    expect(ordine[allegato + 1]).toBe("investimento");
    for (const pagina of PRODOTTI) expect(ordine.indexOf(pagina)).toBeLessThan(allegato);
    expect(ids(SR_PDF_PAGES_DEFAULT)).toEqual(ordine);
  });

  it("vale anche per un ordine salvato prima della regola", () => {
    const ordine = ids(normalizePdfPagesOrder(salvato([
      "chi_siamo", "proposta", "macro_dedicate", "linee_dedicate", "render", "allegato_tecnico",
      "articoli_dedicati", "percorso", "garanzie", "confronto", "investimento", "faq", "cta",
      "condizioni", "gallery_lavori",
    ])));
    const allegato = ordine.indexOf("allegato_tecnico");
    expect(ordine.indexOf("articoli_dedicati")).toBeLessThan(allegato);
    expect(ordine[allegato + 1]).toBe("investimento");
    expect(ordine.slice(allegato + 2, allegato + 5)).toEqual(["percorso", "garanzie", "confronto"]);
  });

  it("una pagina prodotto già messa prima dell'allegato resta dov'è", () => {
    const ordine = ids(normalizePdfPagesOrder(salvato(["render", "chi_siamo", "proposta", "allegato_tecnico", "investimento"])));
    expect(ordine[0]).toBe("render");
    expect(ordine[ordine.indexOf("allegato_tecnico") + 1]).toBe("investimento");
  });
});
