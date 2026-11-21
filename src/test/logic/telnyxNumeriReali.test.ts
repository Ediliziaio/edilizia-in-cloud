/// <reference types="node" />
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const sorgente = readFileSync("supabase/functions/telnyx-cerca-numeri/index.ts", "utf8");
const codice = ts.transpileModule(sorgente.replace(/^import .*;$/gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

async function cerca(provider: Response | Error, { accountAttivo = true, chiave = true } = {}) {
  let handler!: (request: Request) => Promise<Response>;
  const fetchTelnyx = vi.fn(async () => {
    if (provider instanceof Error) throw provider;
    return provider;
  });
  const account = {
    select: () => account,
    eq: () => account,
    maybeSingle: async () => ({ data: accountAttivo ? { stato: "attivo" } : null }),
  };
  runInNewContext(codice, {
    Deno: {
      serve: (fn: typeof handler) => { handler = fn; },
      env: { get: (key: string) => key === "TELNYX_MASTER_API_KEY" && !chiave ? undefined : "demo-locale" },
    },
    Request, Response, URLSearchParams, AbortSignal, corsHeaders: {},
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "utente-demo" } } }) },
      from: () => account,
    }),
    requireCompanyAccess: async () => true,
    fetch: fetchTelnyx,
  });
  const res = await handler(new Request("http://localhost/telnyx-cerca-numeri", {
    method: "POST", headers: { Authorization: "Bearer locale" },
    body: JSON.stringify({ company_id: "azienda-demo", prefisso_area: "02" }),
  }));
  return { status: res.status, data: await res.json(), chiamate: fetchTelnyx.mock.calls.length };
}

describe("disponibilità dei numeri telefonici", () => {
  it("una risposta vuota resta vuota", async () => {
    expect(await cerca(Response.json({ data: [] }))).toEqual({ status: 200, data: { numeri: [] }, chiamate: 1 });
  });

  it.each([429, 503])("un errore HTTP %s del provider non produce risultati", async (status) => {
    const esito = await cerca(Response.json({ detail: "Dettaglio interno" }, { status }));
    expect(esito.status).toBe(502);
    expect(esito.data).not.toHaveProperty("numeri");
    expect(esito.data.error).not.toContain("Dettaglio interno");
  });

  it("una caduta di rete rende la ricerca indisponibile", async () => {
    expect((await cerca(new Error("Timeout simulato"))).status).toBe(502);
  });

  it.each([{ accountAttivo: false }, { chiave: false }])("configurazione incompleta %j", async (opzioni) => {
    const esito = await cerca(Response.json({ data: [] }), opzioni);
    expect(esito).toMatchObject({ status: 503, chiamate: 0 });
    expect(esito.data).not.toHaveProperty("numeri");
  });

  it("il numero simulato dal provider è l’unico restituito alla schermata", async () => {
    const esito = await cerca(Response.json({
      data: [{ phone_number: "+390200000001", features: [{ name: "voice" }] }],
    }));
    expect(esito.status).toBe(200);
    expect(esito.data.numeri).toEqual([{
      numero_e164: "+390200000001", numero_display: "+39 02 0000 0001",
      prefisso_area: "02", citta: null, features: ["voice"],
    }]);
  });
});
