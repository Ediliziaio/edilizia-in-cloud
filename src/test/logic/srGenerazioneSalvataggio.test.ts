import { beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, denoFinto, type Esito } from "../helpers/edgeFinto";

const state = vi.hoisted(() => ({ db: null as unknown as DbMinimo, failure: "", upload: vi.fn() }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => state.db }));
vi.mock("../../../supabase/functions/_shared/auth.ts", () => ({ requireAuth: async () => ({ userId: "u1", supabaseAdmin: state.db }) }));
vi.mock("../../../supabase/functions/_shared/companyAuth.ts", () => ({ verifyCompanyAccess: async (): Promise<void> => undefined }));
vi.mock("../../../supabase/functions/_shared/preventivoFirmaAttiva.ts", () => ({ preventivoFirmaAttiva: async () => false }));
vi.mock("../../../supabase/functions/_shared/srHtmlTemplate.ts", () => ({ renderSrPdfHtml: () => "<!doctype html><html>QA</html>", countSrPdfPages: () => 1 }));
vi.mock("../../../supabase/functions/_shared/immaginiModelloPdf.ts", () => ({ CAMPI_IMMAGINE_SERRAMENTI: [], firmaImmaginiModello: async (v: unknown) => v, firmatarioStorage: () => async (v: unknown) => v }));

// Lo stesso tipo che `Deno.serve` accetta: `denoFinto` consegna il gestore vero cosi' com'e'.
let handler: (r: Request) => Promise<Response> | Response;
beforeEach(async () => {
  state.failure = "";
  state.upload.mockReset();
  state.db = new DbMinimo();
  state.db.tabelle.sr_progetti = [{ id: "p1", company_id: "c1", stato: "bozza", code: "SR-QA", cliente_nome: "QA" }];
  state.db.tabelle.companies = [{ id: "c1", name: "Impresa QA" }];
  const from = state.db.from.bind(state.db);
  state.db.from = ((table: string) => {
    const q = from(table);
    let update = false;
    const proxy: typeof q = new Proxy(q, { get(target, prop) {
      if (prop === "then") return (resolve: (r: unknown) => unknown) => target.then((result: Esito) => resolve(
        state.failure === table || (state.failure === "save" && table === "sr_progetti" && update)
          ? { data: null, error: { message: "Errore QA" } } : result,
      ));
      const value = Reflect.get(target, prop);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => { if (prop === "update") update = true; const result = value.apply(target, args); return result === target ? proxy : result; };
    } });
    return proxy;
  }) as typeof state.db.from;
  Object.assign(state.db, { storage: { from: () => ({
    upload: async (...args: unknown[]) => { state.upload(...args); return { error: null as null }; },
    createSignedUrl: async (): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }> =>
      state.failure === "url" ? { data: null, error: { message: "URL QA" } } : { data: { signedUrl: "https://example.test/qa.html" }, error: null },
  }) } });
  if (!handler) {
    const deno = denoFinto();
    vi.stubGlobal("Deno", deno.finto);
    const module = "../../../supabase/functions/sr-genera-pdf/index.ts";
    await import(/* @vite-ignore */ module);
    handler = deno.gestore()!;
  }
});

async function genera() {
  return handler(new Request("http://localhost/qa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ progetto_id: "p1" }) }));
}

describe("Generatore SR: mai confermare un documento perso o incompleto", () => {
  it("caricamento e salvataggio riusciti", async () => {
    const res = await genera();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, html_url: "https://example.test/qa.html" });
  });
  it("se non si leggono le posizioni non carica un preventivo vuoto", async () => {
    state.failure = "sr_serramenti_progetto";
    const res = await genera();
    expect(res.status).toBe(500);
    expect(state.upload).not.toHaveBeenCalled();
  });
  it("se manca l'URL non salva una stringa vuota nel progetto", async () => {
    state.failure = "url";
    const res = await genera();
    expect(res.status).toBe(500);
    expect(state.db.scritture.filter(x => x.tabella === "sr_progetti")).toHaveLength(0);
  });
  it("se il salvataggio non riesce non risponde con ok true", async () => {
    state.failure = "save";
    const res = await genera();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Salvataggio anteprima fallito") });
    expect(state.db.scritture.filter(x => x.tabella === "sr_pdf_generation_log").some(x => (x.dati as { status: string }).status === "success")).toBe(false);
  });
});
