/// <reference types="node" />
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { canMutateExternalAppointment, canSyncExternalCalendar } from "../../../supabase/functions/_shared/externalAppointmentAccess";

function endpoint(provider: "google" | "apple", opts: { readonly?: boolean; visible?: boolean; permission?: boolean; status?: string } = {}) {
  const source = ts.createSourceFile("index.ts", readFileSync(`supabase/functions/${provider}-calendar-sync/index.ts`, "utf8"), ts.ScriptTarget.Latest, true);
  let handler: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ["serveConMetriche", "serveConMetricheRapida"].includes(node.expression.getText(source))) handler = node.arguments[1];
    ts.forEachChild(node, visit);
  }; visit(source);
  if (!handler) throw new Error("Endpoint non trovato");
  const filters: Record<string, string> = {};
  const query = { eq: (key: string, value: string) => { filters[key] = value; return query; }, maybeSingle: async () => ({ data: opts.visible === false ? null : { id: "apt-a", created_by: "other", status: opts.status ?? "confermato" }, error: null as null }) };
  const caller = {
    auth: { getUser: async () => ({ data: { user: { id: "user-a" } }, error: null as null }) },
    rpc: async (name: string) => ({ data: name === "utente_sola_lettura" && opts.readonly === true, error: null as null }),
    from: () => ({ select: () => query }),
  };
  const admin = { rpc: async () => ({ data: opts.permission !== false, error: null as null }) };
  const operation = vi.fn(async () => Response.json({ success: true }));
  const context = vm.createContext({
    Request, Response, console, Deno: { env: { get: (name: string) => name === "SUPABASE_SERVICE_ROLE_KEY" ? "synthetic-service-key" : "synthetic-value" } },
    cronSecretValido: () => false, createClient: () => caller, getSupabaseAdmin: () => admin,
    canAccessCompany: async () => true, verifyCompanyAccess: async () => true,
    canMutateExternalAppointment, canSyncExternalCalendar, pushEvent: operation, updateEvent: operation, deleteEvent: operation, fullSync: operation,
    json: (body: unknown, status = 200) => Response.json(body, { status }),
  });
  const code = ts.transpileModule(`globalThis.handler = ${handler.getText(source)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(code, context);
  return { operation, filters, run: (action: string, service = false) => context.handler(new Request("https://local.invalid/", { method: "POST", headers: { Authorization: `Bearer ${service ? "synthetic-service-key" : "synthetic-user-token"}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, companyId: "company-a", appointmentId: "apt-a", userId: "user-a" }) })) as Promise<Response> };
}
describe.each(["google", "apple"] as const)("endpoint %s: permessi prima delle credenziali esterne", provider => {
  it.each(["push-event", "update-event", "delete-event"])("nega %s a chi è in sola lettura", async action => {
    const f = endpoint(provider, { readonly: true, status: "annullato" });
    expect((await f.run(action)).status).toBe(403); expect(f.operation).not.toHaveBeenCalled();
  });
  it("nega l'appuntamento non visibile sotto RLS", async () => {
    const f = endpoint(provider, { visible: false });
    expect((await f.run("update-event")).status).toBe(403); expect(f.operation).not.toHaveBeenCalled();
    expect(f.filters).toEqual({ id: "apt-a", company_id: "company-a" });
  });
  it("la sincronizzazione completa non aggira la sola lettura", async () => {
    const f = endpoint(provider, { readonly: true });
    expect((await f.run("full-sync")).status).toBe(403); expect(f.operation).not.toHaveBeenCalled();
  });
  it("nega la cancellazione diretta di un appuntamento ancora attivo", async () => {
    const f = endpoint(provider); expect((await f.run("delete-event")).status).toBe(403); expect(f.operation).not.toHaveBeenCalled();
  });
  it("sincronizza il collega autorizzato e conserva le chiamate fidate del trigger", async () => {
    const f = endpoint(provider); expect((await f.run("update-event")).status).toBe(200);
    const trusted = endpoint(provider, { readonly: true, visible: false });
    expect((await trusted.run("delete-event", true)).status).toBe(200);
    expect(trusted.operation).toHaveBeenCalledTimes(1);
  });
});
