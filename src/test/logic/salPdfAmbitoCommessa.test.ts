import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/generate-sal-pdf/index.ts", "utf8");
const code = ts.transpileModule(source.replace(/^import .*;$/gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function prepara({ visible = true, edit = true, allowedCompany = true } = {}) {
  let serve!: (request: Request) => Promise<Response>;
  const sal = { id: "sal", company_id: "azienda-demo", order_id: "commessa-demo" };
  const companyAccess = vi.fn(async () => {
    if (!allowedCompany) throw new Error("Accesso negato");
  });
  const fromPrivileged = vi.fn((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      single: async (): Promise<{ data: typeof sal | null; error: null }> => ({
        data: table === "sal_records" ? sal : null,
        error: null,
      }),
    };
    return query;
  });
  const fromCaller = vi.fn(() => {
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      maybeSingle: async (): Promise<{ data: { id: string } | null; error: null }> => ({
        data: visible ? { id: sal.order_id } : null,
        error: null,
      }),
    };
    return query;
  });
  const callerRpc = vi.fn(async (): Promise<{ data: boolean; error: null }> => ({ data: edit, error: null }));
  runInNewContext(code, {
    Request, Response, console,
    getCorsHeaders: () => ({}), verifyCompanyAccess: companyAccess,
    Deno: { serve: (handler: typeof serve) => { serve = handler; }, env: { get: (key: string) => key } },
    createClient: (_url: string, key: string) => key === "SUPABASE_SERVICE_ROLE_KEY"
      ? {
        from: fromPrivileged, auth: { getUser: async () => ({ data: { user: { id: "operatore-demo" } } }) },
        rpc: async (): Promise<{ data: boolean; error: null }> => ({ data: true, error: null }),
      }
      : { from: fromCaller, rpc: callerRpc },
  });
  const run = (signature: boolean) => serve(new Request("https://example.invalid/generate-sal-pdf", {
    method: "POST",
    headers: { Authorization: "Bearer test" },
    body: JSON.stringify({ sal_id: sal.id, company_id: sal.company_id, prepare_signature: signature }),
  }));
  return { fromPrivileged, fromCaller, callerRpc, run };
}

it("richiede che la commessa sia visibile prima di leggere il documento o preparare la firma", async () => {
  const fixture = prepara({ visible: false });
  expect((await fixture.run(true)).status).toBe(403);
  expect(fixture.fromCaller).toHaveBeenCalledWith("orders_visibili");
  expect(fixture.fromPrivileged.mock.calls.map(([table]) => table)).toEqual(["sal_records"]);
});

it("richiede il permesso di modifica sulla commessa per la firma, oltre alla sola consultazione", async () => {
  const fixture = prepara({ edit: false });
  expect((await fixture.run(true)).status).toBe(403);
  expect(fixture.callerRpc).toHaveBeenCalledWith("puo_modificare_commessa", { p_order_id: "commessa-demo" });
  expect(fixture.fromPrivileged).not.toHaveBeenCalledWith("sal_signature_tokens");
});

it("una commessa autorizzata prosegue fino alla lettura del documento", async () => {
  const fixture = prepara();
  await fixture.run(true);
  expect(fixture.fromPrivileged).toHaveBeenCalledWith("orders");
});

it("una richiesta senza accesso aziendale termina prima della lettura SAL", async () => {
  const fixture = prepara({ allowedCompany: false });
  expect((await fixture.run(true)).status).toBe(403);
  expect(fixture.fromPrivileged).not.toHaveBeenCalled();
});
