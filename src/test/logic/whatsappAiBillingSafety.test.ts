import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { precallCheck, chargeAndLog } from "../../../supabase/functions/_shared/ai-provider/billing";
import { resolveModelConfig } from "../../../supabase/functions/_shared/ai-provider/config";
vi.mock("../../../supabase/functions/_shared/allarmeAI.ts", () => ({ segnalaErroreAI: vi.fn() }));
import { callOpenRouter } from "../../../supabase/functions/_shared/ai-provider/openrouter";

const dbResult = (result: unknown) => ({ rpc: vi.fn(async () => result) }) as unknown as SupabaseClient;
const chargeParams = { company_id: "fake-company", task_kind: "default" as const, model_used: "fake/model",
  cost_usd_real: 0.012, tokens_prompt: 100, tokens_completion: 50 };

describe("WhatsApp legacy AI billing gates (no wallet writes)", () => {
  it.each([{ error: { message: "offline" } }, { data: null }, { data: [] }, { data: {} }, { data: [{}] }, { data: [{ o_ok: "true" }] }])("fails closed on unverified precheck %j", async result => {
    expect(await precallCheck(dbResult(result), { company_id: "fake", task_kind: "default" }))
      .toMatchObject({ allow: false, reason: "check_unavailable" });
  });
  it("accepts an explicit credit check", async () => {
    expect(await precallCheck(dbResult({ data: [{ o_ok: true, o_reason: "ok" }] }), { company_id: "fake", task_kind: "default" }))
      .toMatchObject({ allow: true });
  });
  it.each([{ data: [{ ok: false }] }, { data: [{ ok: true }] }, { data: { ok: true } }, { error: {} }])("rejects unconfirmed charge %j", async result => {
    expect(await chargeAndLog(dbResult(result), chargeParams)).toMatchObject({ charged: false });
  });
  it("requires a usage log ID for a confirmed debit", async () => {
    expect(await chargeAndLog(dbResult({ data: [{ ok: true, usage_log_id: "fake-log", cost_billed_eur: 0.1 }] }), chargeParams))
      .toMatchObject({ charged: true, usage_log_id: "fake-log", cost_billed_eur: 0.1 });
  });
  it("does not bypass an explicitly disabled task with the default model", async () => {
    const q = { select: vi.fn(() => q), is: vi.fn(() => q), eq: vi.fn(() => q),
      maybeSingle: vi.fn(async () => ({ data: { primary_model: "fake", enabled: false } })) };
    const db = { from: vi.fn(() => q) } as unknown as SupabaseClient;
    expect((await resolveModelConfig(db, "default")).enabled).toBe(false);
    expect(q.eq).not.toHaveBeenCalledWith("enabled", true);
    expect(db.from).toHaveBeenCalledOnce();
  });
  it("does not use emergency paid routing after configuration read errors", async () => {
    const q = { select: () => q, is: () => q, eq: () => q, maybeSingle: async () => ({ error: { message: "offline" } }) };
    await expect(resolveModelConfig({ from: () => q } as unknown as SupabaseClient, "default")).rejects.toThrow("configuration unavailable");
  });
});

describe("WhatsApp provider failure safety (all HTTP mocked)", () => {
  beforeEach(() => vi.stubGlobal("Deno", { env: { get: (key: string) => key === "OPENROUTER_API_KEY" ? "fake-key" : undefined } }));
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  const params = { model: "fake/model", messages: [{ role: "user", content: "test" }] };
  const meta = { task_kind: "default", company_id: "fake" };
  it.each([402, 500, 502])("does not retry HTTP %s", async status => {
    const fetcher = vi.fn(async () => new Response("failed", { status })); vi.stubGlobal("fetch", fetcher);
    await expect(callOpenRouter(params, meta)).rejects.toMatchObject({ code: status === 402 ? "provider_credits_exhausted" : "provider_outcome_unknown" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("recognizes a provider credit error inside HTTP 200", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: 402, message: "no credit" } })));
    vi.stubGlobal("fetch", fetcher);
    await expect(callOpenRouter(params, meta)).rejects.toMatchObject({ code: "provider_credits_exhausted" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not retry an ambiguous network failure", async () => {
    const fetcher = vi.fn(async () => { throw new TypeError("connection lost"); }); vi.stubGlobal("fetch", fetcher);
    await expect(callOpenRouter(params, meta)).rejects.toMatchObject({ code: "provider_outcome_unknown" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not treat missing usage and cost as zero", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }))));
    await expect(callOpenRouter(params, meta)).rejects.toMatchObject({ code: "cost_unavailable" });
  });
  it("preserves a real zero provider cost", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { cost: 0 } }))));
    expect(await callOpenRouter(params, meta)).toMatchObject({ cost_usd: 0, cost_is_estimated: false });
  });
  it("keeps timeout active while reading the body", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => ({ ok: true, status: 200,
      json: () => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))) }));
    vi.stubGlobal("fetch", fetcher);
    const assertion = expect(callOpenRouter(params, meta)).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(25_001); await assertion;
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
