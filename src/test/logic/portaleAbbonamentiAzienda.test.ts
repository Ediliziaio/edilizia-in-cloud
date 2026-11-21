import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const path = "supabase/functions/customer-portal/index.ts";
const code = ts.transpileModule(readFileSync(path, "utf8").replace(/^import .*;$/gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

const ownCompany = "bb9cb60e-9689-44a7-b39d-b50ec02adb11";
const activeCompany = "eaf620c7-9429-4ff3-b1b4-f07b5d8b5481";

function makeFixture({ lookupError = false, admin = true, resolvedCompany = activeCompany } = {}) {
  let handler!: (input: Request) => Promise<Response>;
  let companyId = "";
  const create = vi.fn(async () => ({ url: "https://example.invalid/portale" }));
  const config = vi.fn(async () => "chiave-test");
  const db = {
    from: (table: string) => ({
      select: () => ({
        eq: (_key: string, value: string) => ({
          single: async () => ({
            data: table === "profiles"
              ? { company_id: ownCompany }
              : { stripe_customer_id: value === ownCompany ? "cus_a" : "cus_b" },
          }),
        }),
      }),
    }),
  };
  const client = (_url: string, _key: string, options: { global: { headers: Record<string, string> } }) => {
    companyId = options.global.headers["x-azienda-scheda"] ?? "";
    return {
      rpc: async (name: string): Promise<{ data: string | boolean | null; error: { message: string } | null }> => name === "get_effective_company_id"
        ? { data: lookupError ? null : resolvedCompany, error: lookupError ? { message: "rete" } : null }
        : { data: admin, error: null },
    };
  };
  const reply = (data: unknown, status: number) => new Response(JSON.stringify(data), { status });
  runInNewContext(code, {
    Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: () => "fake" } },
    Request, Response, console,
    Stripe: class {
      subscriptions = { list: async () => ({ data: [{ id: "sub_b", status: "active" }] }) };
      billingPortal = { sessions: { create } };
    },
    getCorsHeaders: () => ({}),
    errorResponse: (message: string, status: number) => reply({ message }, status),
    jsonResponse: reply,
    getPlatformSetting: config,
    requireAuth: async () => ({ userId: "utente-demo", supabaseAdmin: db }),
    createClient: client,
  });
  const run = () => handler(new Request("https://example.invalid/customer-portal", {
    method: "POST",
    headers: { Authorization: "Bearer test" },
    body: JSON.stringify({ flow: "cancel", company_id: activeCompany }),
  }));
  return { run, create, aziendaInviata: () => companyId };
}

describe("portale Stripe con due aziende e risposte simulate", () => {
  it("ferma il portale quando non riesce a risolvere l’azienda attiva", async () => {
    const fixture = makeFixture({ lookupError: true });
    expect((await fixture.run()).status).toBe(503);
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it("usa l’azienda attiva per la disdetta e propaga il contesto della scheda", async () => {
    const fixture = makeFixture();
    expect((await fixture.run()).status).toBe(200);
    expect(fixture.aziendaInviata()).toBe(activeCompany);
    expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({
      customer: "cus_b",
      flow_data: expect.objectContaining({ subscription_cancel: { subscription: "sub_b" } }),
    }));
  });

  it("rifiuta chi non amministra l’azienda", async () => {
    const fixture = makeFixture({ admin: false });
    expect((await fixture.run()).status).toBe(403);
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it("ferma il portale se il servizio indica un’azienda diversa da quella della scheda", async () => {
    const fixture = makeFixture({ resolvedCompany: ownCompany });
    expect((await fixture.run()).status).toBe(403);
    expect(fixture.create).not.toHaveBeenCalled();
  });
});
