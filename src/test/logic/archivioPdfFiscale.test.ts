import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/generate-native-pdf/index.ts", "utf8");
const handlerCode = ts.transpileModule(source.replace(/^import .*;$/gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function prepara({ erroreUpload = false, erroreCollegamento = false, rigaCollegata = true } = {}) {
  let handler!: (request: Request) => Promise<Response>;
  const storage = new Set<string>();
  let percorso: string | null = null;
  const upload = vi.fn(async (path: string) => {
    if (erroreUpload) return { error: new Error("Storage indisponibile") };
    storage.add(path);
    return { error: null };
  });
  const update = vi.fn((data: { pdf_url: string }) => {
    const result = async (): Promise<{ data?: { id: string } | null; error: Error | null }> => {
      if (erroreCollegamento) return { error: new Error("Database indisponibile") };
      if (!rigaCollegata) return { data: null, error: null };
      percorso = data.pdf_url;
      return { data: { id: "documento" }, error: null };
    };
    const branch = { select: () => ({ maybeSingle: result }), then: (resolve: (v: unknown) => unknown) => result().then(resolve) };
    return { eq: () => branch };
  });
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "utente" } } }) },
    storage: { from: () => ({ upload }) },
    from: (table: string) => {
      const row = table === "documenti_fiscali" ? { id: "documento", company_id: "azienda" } : {};
      const response = async (): Promise<{ data: typeof row; error: null }> => ({ data: row, error: null });
      return { select: () => ({ eq: () => ({ single: response, maybeSingle: response }) }), update };
    },
  };
  runInNewContext(handlerCode, {
    Request, Response, Blob, console,
    Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: () => "test" } },
    createClient: () => db, getCorsHeaders: () => ({}), verifyCompanyAccess: async (): Promise<void> => undefined,
    errorResponse: (error: string, status: number) => new Response(JSON.stringify({ error }), { status }),
    puoGestireDocumento: async () => true, puoLeggereDocumento: async () => true,
    logoDiRiserva: (): null => null, getBrandingForCompany: async () => ({ platformName: "Demo" }),
    documentoHtml: () => "<html>Documento sintetico</html>",
  });
  const run = (archivia = true) => handler(new Request("https://example.invalid/generate-native-pdf", {
    method: "POST", headers: { Authorization: "Bearer test" },
    body: JSON.stringify({ documento_id: "documento", upload: archivia }),
  }));
  return { run, storage, update, percorso: () => percorso };
}

describe("archiviazione del documento fiscale con Storage e tabella simulati", () => {
  it("un errore Storage impedisce di registrare il percorso", async () => {
    const fixture = prepara({ erroreUpload: true });
    const response = await fixture.run();
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("pdf_url");
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.storage.size).toBe(0);
  });

  it.each([{ erroreCollegamento: true }, { rigaCollegata: false }])("un collegamento non confermato non risulta riuscito (%j)", async (failure) => {
    const fixture = prepara(failure);
    const response = await fixture.run();
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("pdf_url");
    expect(fixture.percorso()).toBeNull();
  });

  it("restituisce il percorso solo quando il file e il riferimento esistono", async () => {
    const fixture = prepara();
    const response = await fixture.run();
    expect(response.status).toBe(200);
    const { pdf_url } = await response.json();
    expect(fixture.percorso()).toBe(pdf_url);
    expect(fixture.storage.has(pdf_url)).toBe(true);
  });

  it("la semplice anteprima genera l'HTML senza archiviare", async () => {
    const fixture = prepara();
    expect(await (await fixture.run(false)).json()).toEqual({ html: "<html>Documento sintetico</html>" });
    expect(fixture.storage.size).toBe(0);
    expect(fixture.update).not.toHaveBeenCalled();
  });
});
