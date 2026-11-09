/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as safety from "../../../supabase/functions/_shared/metaAdsPublicationSafety";
import * as media from "../../../supabase/functions/_shared/metaAdsPubblicazione";

// Esegue l'handler reale, con DB e Graph simulati: nessuna campagna o richiesta esterna reale.
type Row = Record<string, any>;
const company = "00000000-0000-4000-8000-000000000001";
const campaign = "00000000-0000-4000-8000-000000000002";
const integration = "00000000-0000-4000-8000-000000000003";
const account = "00000000-0000-4000-8000-000000000004";
const state: Row = { name: "Prova", objective: "OUTCOME_LEADS", budgetMode: "campaign", dailyBudget: 10, adSets: [], creatives: [], copyVariants: [], pageMetaId: "page-a" };
const compiled = ts.transpileModule(readFileSync(resolve(process.cwd(), "supabase/functions/meta-ads-create-campaign/index.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  const tables: Record<string, Row[]> = {
    profiles: [{ id: "user", company_id: company }], user_roles: [{ user_id: "user", role: "company_admin" }],
    meta_assets: [
      { id: "asset-ad", asset_id: "act_123", company_id: company, integration_id: integration, asset_type: "ad_account", selected: true, metadata: { currency: "EUR" } },
      { id: "asset-page", asset_id: "page-a", company_id: company, integration_id: integration, asset_type: "page", selected: true, metadata: {} },
    ],
    meta_ad_accounts: [{ id: account, company_id: company, integration_id: integration, ad_account_id: "act_123", currency: "EUR" }],
    ad_spend_guard: [{ company_id: company, ad_account_id: account, is_active: true, campaign_approval_threshold_cents: 0, daily_cap_cents: 100000, monthly_cap_cents: 1000000 }],
    meta_insights_cache: [], integrations: [{ id: integration, company_id: company, status: "connected" }],
    integration_credentials: [{ integration_id: integration, access_token_encrypted: "fake" }],
    meta_campaigns: [{ id: campaign, company_id: company, status: "draft", meta_campaign_id: null, builder_state: structuredClone(state), daily_budget_cents: 1000 }],
    meta_campaign_publication_locks: [],
  };
  const faults = { record: false };
  const admin = { from(table: string) {
    let operation = "select"; let payload: Row = {}; let single = false;
    const filters: Array<(row: Row) => boolean> = [];
    const q: any = {
      select: () => q, eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return q; },
      in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return q; },
      or: () => q, gte: () => q, limit: () => q,
      insert: (row: Row) => { operation = "insert"; payload = row; return q; },
      update: (row: Row) => { operation = "update"; payload = row; return q; },
      delete: () => { operation = "delete"; return q; },
      single: () => { single = true; return q; }, maybeSingle: () => { single = true; return q; },
      then: (resolveResult: (v: unknown) => unknown) => {
        if (faults.record && table === "meta_campaigns" && operation === "update" && payload.meta_campaign_id) return Promise.resolve({ error: { code: "XX000" }, data: null }).then(resolveResult);
        const rows = tables[table] ?? (tables[table] = []);
        let matches = rows.filter((row) => filters.every((filter) => filter(row)));
        if (operation === "insert") {
          if (table === "meta_campaign_publication_locks" && rows.some((row) => row.campaign_id === payload.campaign_id)) return Promise.resolve({ error: { code: "23505" }, data: null }).then(resolveResult);
          const row = { id: crypto.randomUUID(), ...payload }; rows.push(row); matches = [row];
        } else if (operation === "update") matches.forEach((row) => Object.assign(row, payload));
        else if (operation === "delete") tables[table] = rows.filter((row) => !matches.includes(row));
        return Promise.resolve({ error: null, data: single ? matches[0] ?? null : matches }).then(resolveResult);
      },
    };
    return q;
  } };
  let handler!: (request: Request) => Promise<Response>;
  const env: Row = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };
  const dependencies = (name: string) => {
    if (name.startsWith("https://esm.sh/")) return { createClient: (_url: string, key: string) => key === "service" ? admin : { auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null as null }) } } };
    if (name.includes("encryption")) return { decrypt: async () => "fake-token", getEncryptionKey: () => "fake-key" };
    if (name.includes("headers")) return { getCorsHeaders: () => ({}) };
    if (name.includes("metaAdsPublicationSafety")) return safety;
    if (name.includes("metaAdsPubblicazione")) return media;
    throw new Error(`Dipendenza non simulata: ${name}`);
  };
  new Function("require", "Deno", "exports", "console", compiled)(dependencies,
    { env: { get: (key: string) => env[key] }, serve: (callback: typeof handler) => { handler = callback; } }, {}, { error: vi.fn(), warn: vi.fn() });
  const request = (builderState: Row = state) => new Request("https://test/", { method: "POST", headers: { Authorization: "Bearer fake" }, body: JSON.stringify({ company_id: company, ad_account_id: "act_123", draft_id: campaign, dry_run: false, builder_state: builderState }) });
  return { tables, handler, request, faults };
}
afterEach(() => vi.unstubAllGlobals());
describe("handler Ads: pubblicazione protetta end-to-end", () => {
  it("un doppio invio crea una sola campagna; anche un nuovo invio dopo il successo è rifiutato", async () => {
    const f = fixture();
    let reached!: () => void; let finish!: () => void;
    const started = new Promise<void>((resolve) => { reached = resolve; });
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const graph = vi.fn(async (url: string) => {
      if (!url.startsWith("https://graph.facebook.com/")) throw new Error("Rete esterna vietata nel test");
      reached(); await gate; return new Response(JSON.stringify({ id: "meta-created" }), { status: 200 });
    });
    vi.stubGlobal("fetch", graph);
    const first = f.handler(f.request()); await started;
    const second = await f.handler(f.request());
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("publication_in_progress");
    expect(graph).toHaveBeenCalledTimes(1); finish();
    expect((await (await first).json()).success).toBe(true);
    expect(f.tables.meta_campaign_publication_locks).toHaveLength(0);
    expect((await f.handler(f.request())).status).toBe(409);
    expect(graph).toHaveBeenCalledTimes(1);
  });
  it("rifiuta la Pagina estranea senza chiamare Graph e libera il claim", async () => {
    const f = fixture(); const graph = vi.fn(); vi.stubGlobal("fetch", graph);
    f.tables.meta_campaigns[0].builder_state = { ...state, pageMetaId: "page-estranea" };
    const result = await f.handler(f.request({ ...state, pageMetaId: "page-estranea" }));
    expect(result.status).toBe(400); expect(graph).not.toHaveBeenCalled();
    expect(f.tables.meta_campaign_publication_locks).toHaveLength(0);
  });
  it("una vecchia approvazione non autorizza un budget diverso inviato direttamente all'API", async () => {
    const f = fixture(); const graph = vi.fn(); vi.stubGlobal("fetch", graph);
    f.tables.ad_spend_guard[0].campaign_approval_threshold_cents = 500;
    f.tables.meta_campaigns[0].approved_at = "2026-11-09";
    f.tables.meta_campaigns[0].builder_state = { ...state, dailyBudget: 20 };
    const result = await f.handler(f.request({ ...state, dailyBudget: 20 }));
    expect(result.status).toBe(403); expect(graph).not.toHaveBeenCalled();
    expect(f.tables.meta_campaign_publication_locks).toHaveLength(0);
  });
  it("una richiesta da una scheda rimasta indietro non sovrascrive la bozza aggiornata", async () => {
    const f = fixture(); const graph = vi.fn(); vi.stubGlobal("fetch", graph);
    f.tables.meta_campaigns[0].builder_state = { ...state, name: "Modificata nell’altra scheda" };
    const response = await f.handler(f.request());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("draft_changed");
    expect(graph).not.toHaveBeenCalled();
    expect(f.tables.meta_campaign_publication_locks).toHaveLength(0);
  });

  it("un rollback incompleto conserva il claim e impedisce la creazione di duplicati al tentativo successivo", async () => {
    const f = fixture(); f.faults.record = true;
    const graph = vi.fn(async (_url: string, options: RequestInit) => options.method === "DELETE"
      ? new Response(JSON.stringify({ error: { message: "Meta non disponibile" } }), { status: 500 })
      : new Response(JSON.stringify({ id: "meta-da-verificare" }), { status: 200 }));
    vi.stubGlobal("fetch", graph);
    const result = await f.handler(f.request());
    expect((await result.json()).success).toBe(false);
    expect(f.tables.meta_campaign_publication_locks).toHaveLength(1);
    expect((await f.handler(f.request())).status).toBe(409);
    expect(graph).toHaveBeenCalledTimes(2);
  });
  it("se Meta rifiuta la creazione senza creare oggetti, il tentativo si chiude e può essere ripetuto", async () => {
    const f = fixture();
    const graph = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Dati rifiutati", code: 100 } }), { status: 400 }));
    vi.stubGlobal("fetch", graph);
    expect((await (await f.handler(f.request())).json()).success).toBe(false);
    expect(f.tables.meta_campaign_publication_locks).toHaveLength(0);
    expect(f.tables.meta_campaigns[0].status).toBe("error");
    expect(f.tables.meta_campaigns[0].meta_campaign_id).toBeNull();
  });

});
