import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
const render = vi.hoisted(() => vi.fn());
vi.mock("../../../supabase/functions/_shared/fotovoltaicoPdfOriginale.ts", () => ({ fotovoltaicoPdfOriginale: render }));
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => await import("pdf-lib"));
beforeEach(async () => {
  const pdf = await PDFDocument.create(); pdf.addPage([595, 842]);
  render.mockReset(); render.mockResolvedValue(await pdf.save());
});
// Import dinamico: il controllo dei tipi dell'app non deve seguire il modulo Deno (pdf-lib da esm.sh).
type Fonte = { tipo: string; documentoId: string; companyId: string; aziendaNome: string; firmatario: string };
type Modulo = {
  congelaDocumento: (sb: unknown, f: Fonte, richiestaId: string) => Promise<{ path: string; hash: string }>;
  DocumentoNonPronto: new (m?: string) => Error;
};
const percorso = "../../../supabase/functions/_shared/documentoCongelato";
const { congelaDocumento, DocumentoNonPronto } = (await import(/* @vite-ignore */ percorso)) as Modulo;

/** Storage e tabelle finti: quanto basta per congelare un documento. */
function sbFinto(file: string, righe: Record<string, Record<string, unknown>>) {
  const caricati: Array<{ path: string; tipo: string }> = [];
  const sb = {
    from: (t: string) => t === "fv_componenti_progetto"
      ? { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }
      : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: righe[t] ?? null }) }) }) },
    storage: { from: () => ({
      download: async () => ({ data: new Blob([file]), error: null as null }),
      upload: async (path: string, _b: unknown, o: { contentType: string }) => { caricati.push({ path, tipo: o.contentType }); return { error: null as null }; },
    }) },
  };
  return { sb, caricati };
}
const base = { companyId: "c-1", aziendaNome: "Demo", firmatario: "Mario Rossi" };

describe("Documento congelato all'invio", () => {
  it("un PDF si congela come PDF, con la sua impronta", async () => {
    const { sb, caricati } = sbFinto("%PDF-1.4 contratto", { contratti_subappalto: { pdf_path: "c-1/subappalti/x.pdf" } });
    const esito = await congelaDocumento(sb, { ...base, tipo: "subappalto", documentoId: "x" }, "r-1");
    expect(esito.path).toBe("c-1/richieste/r-1.pdf");
    expect(esito.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(caricati).toEqual([{ path: "c-1/richieste/r-1.pdf", tipo: "application/pdf" }]);
  });
  it("il fotovoltaico HTML viene convertito prima di congelare e firmare il PDF completo", async () => {
    const { sb, caricati } = sbFinto("<!DOCTYPE html><html>preventivo</html>", { fv_progetti: { pdf_vendita_url: "c-1/p/vendita.html" } });
    const esito = await congelaDocumento(sb, { ...base, tipo: "fv", documentoId: "p" }, "r-2");
    expect(esito.path).toBe("c-1/richieste/r-2.pdf");
    expect(caricati[0].tipo).toBe("application/pdf");
    expect(render).toHaveBeenCalledTimes(1);
  });
  it("se la conversione fallisce non salva né congela un documento incompleto", async () => {
    render.mockRejectedValueOnce(new Error("Conversione non disponibile"));
    const { sb, caricati } = sbFinto("<!doctype html><html>QA</html>", { fv_progetti: { pdf_vendita_url: "c-1/p/vendita.html" } });
    await expect(congelaDocumento(sb, { ...base, tipo: "fv", documentoId: "p" }, "r-2")).rejects.toThrow("Conversione non disponibile");
    expect(caricati).toHaveLength(0);
  });
  it("un file con intestazione PDF ma corrotto non viene mandato in firma", async () => {
    const { sb, caricati } = sbFinto("%PDF-1.4 corrotto", { fv_progetti: { pdf_vendita_url: "c-1/p/vendita.pdf" } });
    await expect(congelaDocumento(sb, { ...base, tipo: "fv", documentoId: "p" }, "r-2")).rejects.toThrow("non è leggibile");
    expect(caricati).toHaveLength(0);
  });
  it("senza documento l'invio si ferma con una frase chiara", async () => {
    const { sb } = sbFinto("", { fv_progetti: { pdf_vendita_url: null } });
    await expect(congelaDocumento(sb, { ...base, tipo: "fv", documentoId: "p" }, "r-3")).rejects.toBeInstanceOf(DocumentoNonPronto);
  });
  it("un file che non è né PDF né pagina non si manda in firma", async () => {
    const { sb } = sbFinto("PK\u0003\u0004zip", { contratti_subappalto: { pdf_path: "c-1/x.zip" } });
    await expect(congelaDocumento(sb, { ...base, tipo: "subappalto", documentoId: "x" }, "r-4")).rejects.toThrow("deve essere un PDF");
  });
});
