import { beforeEach, describe, expect, it, vi } from "vitest";
import { caricaFotoPianoLavori, scenaFase } from "@/lib/serramenti/fotoPianoLavoriPdf";
import { toDataUrl } from "@/lib/serramenti/pdfImageUtils";
import type { SrTemplatePdfRow } from "@/types/serramenti";

vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: vi.fn(async (url: string) => `loaded:${url}`) }));
const template = (): Partial<SrTemplatePdfRow> => ({ pdf_blocchi: { modulo_intervento: "finestre", pagina_percorso: { senzaFoto: true } },
  percorso_cliente: { attivo: true, immagini_illustrative: true, titolo: "Percorso", sottotitolo: "", fasi: [
    { nome: "Rilievo", icona: "chiamata", step: [] }, { nome: "Scelta", icona: "proposta", step: [] },
    { nome: "Conferma", icona: "produzione", step: [] }, { nome: "Consegna", icona: "montaggio", step: [] },
  ] } });

beforeEach(() => vi.clearAllMocks());
describe("Fotografie illustrative del piano", () => {
  it.each([["Rilievo misure", "rilievo"], ["Scelta finiture", "scelte"], ["Conferma ordine", "conferma"], ["Posa", "posa"],
    ["Consegna e collaudo", "consegna"], ["Fase personalizzata", null]])("abbina solo scene pertinenti: %s", (nome, expected) => {
    expect(scenaFase({ nome })).toBe(expected);
  });
  it("carica quattro scene distinte anche senza campi operativi aggiuntivi", async () => {
    const result = await caricaFotoPianoLavori(template());
    expect(result?.fasi).toHaveLength(4);
    expect(new Set(result?.fasi).size).toBe(4);
    expect(result?.illustrativa).toBe(true);
  });
  it("rispetta la disattivazione esplicita delle immagini", async () => {
    const t = template(); t.percorso_cliente!.immagini_illustrative = false;
    expect(await caricaFotoPianoLavori(t)).toBeNull();
    expect(toDataUrl).not.toHaveBeenCalled();
  });
  it("non sostituisce una fotografia personalizzata dell'azienda", async () => {
    const t = template(); t.pdf_blocchi = { pagina_percorso: { foto: ["https://example.test/foto-azienda.jpg"] } };
    const result = await caricaFotoPianoLavori(t);
    expect(result?.personalizzata).toContain("foto-azienda.jpg");
    expect(result?.illustrativa).toBe(false);
    expect(toDataUrl).toHaveBeenCalledTimes(1);
  });
  it("non attribuisce fotografie di finestre a moduli di altri prodotti", async () => {
    const t = template(); t.pdf_blocchi = { modulo_intervento: "porte-interne" };
    expect(await caricaFotoPianoLavori(t)).toBeNull();
  });
  it("se un'immagine non arriva resta disponibile l'infografica", async () => {
    vi.mocked(toDataUrl).mockRejectedValueOnce(new Error("Immagine assente"));
    const result = await caricaFotoPianoLavori(template());
    expect(result?.fasi[0]).toBeNull();
    expect(result?.fasi.slice(1).every(Boolean)).toBe(true);
  });
});
