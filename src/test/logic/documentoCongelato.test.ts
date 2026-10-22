import { describe, expect, it } from "vitest";
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
    from: (t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: righe[t] ?? null }) }) }) }),
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
  it("il preventivo fotovoltaico è una pagina HTML: si congela com'è, non si blocca", async () => {
    const { sb, caricati } = sbFinto("<!DOCTYPE html><html>preventivo</html>", { fv_progetti: { pdf_vendita_url: "c-1/p/vendita.html" } });
    const esito = await congelaDocumento(sb, { ...base, tipo: "fv", documentoId: "p" }, "r-2");
    expect(esito.path).toBe("c-1/richieste/r-2.html");
    expect(caricati[0].tipo).toBe("text/html");
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
