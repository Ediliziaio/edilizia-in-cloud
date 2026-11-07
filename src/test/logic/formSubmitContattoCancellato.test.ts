// form-submit (07/11/2026): un contatto cancellato che rimanda il modulo torna
// visibile; uno visibile resta com'è. Si esegue il gestore vero, con un
// database finto e senza rete (stesso metodo di formCustomFieldsHandler.test.ts).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as helpers from "../../../supabase/functions/_shared/formCustomFields";

const company = "11111111-1111-4111-8111-111111111111";
const source = ts.transpileModule(
  readFileSync("supabase/functions/form-submit/index.ts", "utf8").replace(/^import .*$/gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

function setup(contatto: { id: string; tags: string[]; deleted_at: string | null }) {
  const calls: Array<{ table: string; method: string; value: unknown }> = [];
  let handler: (r: Request) => Promise<Response> = async () => new Response(null);
  const form = {
    id: "form", company_id: company, is_published: true, is_active: true, settings: {}, theme: {},
    fields: [{ id: "email", name: "email", type: "email", mapping: "email", required: true }],
  };
  const db = {
    rpc: async () => ({ data: null as unknown, error: null as unknown }),
    from(table: string) {
      const q: unknown = new Proxy({}, {
        get(_t, key: string) {
          if (key === "then") {
            return (ok: (v: unknown) => unknown) => Promise.resolve(
              table === "lead_forms" ? { data: form, error: null as unknown }
                : table === "marketing_contacts" ? { data: contatto, error: null as unknown }
                : { data: { id: "submission" }, error: null as unknown },
            ).then(ok);
          }
          return (value: unknown) => {
            if (["insert", "update", "upsert", "delete", "order"].includes(key)) calls.push({ table, method: key, value });
            return q;
          };
        },
      });
      return q;
    },
  };
  vm.runInNewContext(source, {
    ...helpers, createClient: () => db, getCorsHeaders: () => ({}),
    Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: () => "not-a-real-key" } },
    crypto: webcrypto, TextEncoder, Response, console: { log() {}, error() {}, warn() {} },
    fetch: () => { throw new Error("NETWORK FORBIDDEN"); },
  });
  const send = () => handler(new Request("https://example.invalid/form-submit", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ form_id: "form", data: { email: "lead@esempio.it" } }),
  }));
  const aggiornamentoContatto = () =>
    calls.find((c) => c.table === "marketing_contacts" && c.method === "update")?.value as Record<string, unknown> | undefined;
  return { calls, send, aggiornamentoContatto };
}

describe("form-submit: contatto cancellato che si ripresenta", () => {
  it("torna visibile e non se ne crea un altro", async () => {
    const s = setup({ id: "contact", tags: [], deleted_at: "2026-11-07T16:44:48Z" });
    expect((await s.send()).status).toBe(200);
    expect(s.aggiornamentoContatto()).toMatchObject({ deleted_at: null, deleted_by: null });
    expect(s.calls.some((c) => c.table === "marketing_contacts" && c.method === "insert")).toBe(false);
  });

  it("un contatto visibile non riceve deleted_at", async () => {
    const s = setup({ id: "contact", tags: [], deleted_at: null });
    expect((await s.send()).status).toBe(200);
    expect(s.aggiornamentoContatto()).not.toHaveProperty("deleted_at");
  });

  it("cerca prima il contatto visibile (cancellati in fondo)", async () => {
    const s = setup({ id: "contact", tags: [], deleted_at: null });
    await s.send();
    expect(s.calls).toContainEqual({ table: "marketing_contacts", method: "order", value: "deleted_at" });
  });
});
