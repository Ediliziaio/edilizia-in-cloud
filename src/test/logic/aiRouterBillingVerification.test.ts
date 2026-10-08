import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiTurnControl } from "../../../supabase/functions/_shared/aiTurnControl";
vi.mock("../../../supabase/functions/_shared/requirePaymentMethod.ts", () => ({ checkPaymentMethod: vi.fn(async () => ({ allowed: true })) }));
vi.mock("../../../supabase/functions/_shared/allarmeAI.ts", () => ({ segnalaErroreAI: vi.fn() }));
import { aiRouterComplete } from "../../../supabase/functions/_shared/aiRouter";

// Read-only production inspection, 2026-10-07: t2_vision rates and charge_ai_call
// formula. This is an RPC SIMULATION, not an execution of PostgreSQL/wallet code.
// No credentials, real network, company records or credit balances are used.
const RATE = { input: 1.925, output: 7.7, wholesaleInput: 0.55, wholesaleOutput: 2.2, floor: 3 };
const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
type Args = Record<string, unknown>;

function fakeDb(options: { denyCredit?: boolean; billingFailure?: boolean; billingRejected?: boolean; cacheHit?: boolean; noWholesaleRate?: boolean;
  guardUnavailable?: boolean; checkpointFailure?: boolean; finishFailure?: boolean } = {}) {
  const entries = new Map<string, { ledger_id: string; cost_real_eur: number; cost_billed_eur: number; margin_eur: number }>();
  const requests = new Map<string, { state: string; input: unknown; owner: unknown; result?: unknown; attempts: unknown[] }>();
  let cooldown = false;
  const rpc = vi.fn(async (name: string, args: Args = {}) => {
    if (name === "ai_provider_request_claim") {
      if (options.guardUnavailable) return { error: { message: "missing RPC" } };
      const key = String(args.p_key), previous = requests.get(key);
      if (previous) return { data: previous.input !== args.p_input_hash ? { state: "request_conflict" }
        : { state: previous.state === "running" ? "in_progress" : previous.state, result: previous.result } };
      if (cooldown) return { data: { state: "provider_cooldown" } };
      requests.set(key, { state: "running", owner: args.p_owner, input: args.p_input_hash, attempts: [] });
      return { data: { state: "claimed" } };
    }
    if (name === "ai_provider_request_checkpoint") {
      if (options.checkpointFailure) return { error: { message: "checkpoint unavailable" } };
      const row = requests.get(String(args.p_key))!;
      row.attempts.push(args.p_attempt); return { data: true };
    }
    if (name === "ai_provider_request_finish") {
      if (options.finishFailure) return { error: { message: "finish unavailable" } };
      const row = requests.get(String(args.p_key))!;
      row.state = args.p_failure ? "uncertain" : "completed"; row.result = args.p_result;
      if (args.p_provider_blocked) cooldown = true;
      return { data: true };
    }
    if (name === "get_ai_router_config") return { data: { primary_model: "anthropic/claude-sonnet-4.5",
      fallback_models: ["openai/gpt-4o-mini"], default_params: {}, tier_key: "t2_vision" } };
    if (name === "precheck_ai_credit") return { data: { ok: !options.denyCredit, reason: "test_credit_gate" } };
    if (name !== "charge_ai_call") return { data: null };
    if (options.billingFailure) return { error: { message: "test ledger unavailable" } };
    if (options.billingRejected) return { data: { success: false, error: "wallet rejected" } };
    const key = String(args.p_idempotency_key);
    const previous = entries.get(key);
    if (previous) return { data: { success: true, idempotent_replay: true, ledger_id: previous.ledger_id } };
    const providerEur = round8(Number(args.p_cost_real_usd) * Number(args.p_fx_usd_to_eur));
    const input = Number(args.p_tokens_in), output = Number(args.p_tokens_out);
    const tokenPrice = input + output === 0 && providerEur > 0
      ? round8(providerEur * 4.5) // applied_markup_pct=350 for tokenless calls
      : round8((input * RATE.input + output * RATE.output) / 1e6);
    const charged = args.p_status === "success" ? Math.max(tokenPrice, round8(providerEur * RATE.floor)) : 0;
    const row = { ledger_id: `test-ledger-${entries.size}`, cost_real_eur: providerEur,
      cost_billed_eur: charged, margin_eur: round8(charged - providerEur) };
    entries.set(key, row);
    return { data: { success: true, idempotent_replay: false, ...row } };
  });
  const insert = vi.fn(async () => ({ error: null }));
  const from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn(() => chain), gt: vi.fn(() => chain),
      update: vi.fn(() => chain), insert, upsert: vi.fn(async () => ({ error: null })),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      maybeSingle: vi.fn(async () => ({ data: table === "ai_pricing_tiers"
        ? options.noWholesaleRate ? null : { cost_per_1m_input_eur: RATE.wholesaleInput, cost_per_1m_output_eur: RATE.wholesaleOutput }
        : options.cacheHit && table === "ai_response_cache" ? { id: "cache-test", output_content: "Risposta salvata", model_used: "test", hits: 1 } : null })),
    };
    return chain;
  });
  return { rpc, from, entries, requests };
}

function reply(usage: Record<string, unknown>, content = "Risposta di prova") {
  return new Response(JSON.stringify({ id: "gen-test-not-real", choices: [{ message: { content }, finish_reason: "stop" }], usage }),
    { headers: { "Content-Type": "application/json" } });
}

const request = { taskKey: "persona_silvio", companyId: "company-test", userId: "user-test",
  messages: [{ role: "user" as const, content: "Solo dati fittizi" }], params: { max_tokens: 2500 }, fxUsdToEur: 0.92 };

describe("Silvio billing verification — simulated RPC and provider", () => {
  beforeEach(() => vi.stubGlobal("Deno", { env: { get: (key: string) => key === "OPENROUTER_API_KEY" ? "fake-key-never-sent" : undefined } }));
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("converts the reported provider cost once and applies the configured resale floor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ prompt_tokens: 10000, completion_tokens: 1000, cost: 0.045 })));
    const supabase = fakeDb(); const turn = new AiTurnControl();
    const result = await aiRouterComplete({ ...request, supabase, turnControl: turn });
    expect(result.costUsd).toBe(0.045);
    expect(result.costRealEur).toBe(0.0414);
    expect(result.costBilledEur).toBe(0.1242); // max(0.02695 token price, 0.0414*3)
    expect(result.marginEur).toBe(0.0828);
    expect(turn.snapshot()).toMatchObject({ reported_cost_usd: 0.045, billed_cost_eur: 0.1242 });
  });

  it("does not add cached or reasoning tokens again to the billable totals", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ prompt_tokens: 10000, completion_tokens: 1000, cost: 0.009,
      prompt_tokens_details: { cached_tokens: 8000, cache_write_tokens: 1000 }, completion_tokens_details: { reasoning_tokens: 700 } })));
    const supabase = fakeDb(); const turn = new AiTurnControl();
    const result = await aiRouterComplete({ ...request, supabase, turnControl: turn });
    const chargedArgs = supabase.rpc.mock.calls.find(c => c[0] === "charge_ai_call")![1];
    expect(chargedArgs).toMatchObject({ p_tokens_in: 10000, p_tokens_out: 1000, p_cost_real_usd: 0.009 });
    expect(result.costBilledEur).toBe(0.02695); // token tariff exceeds the 3x floor
    expect(turn.snapshot()).toMatchObject({ input_tokens: 10000, output_tokens: 1000, reasoning_tokens: 700, cached_input_tokens: 8000 });
  });

  it("keeps zero provider cost distinct from the company's token tariff", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ prompt_tokens: 10000, completion_tokens: 1000, cost: 0 })));
    const result = await aiRouterComplete({ ...request, supabase: fakeDb() });
    expect(result.costUsd).toBe(0);
    expect(result.costRealEur).toBe(0);
    expect(result.costBilledEur).toBe(0.02695);
  });

  it("marks missing provider cost incomplete even when a tier estimate is available", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ prompt_tokens: 10000, completion_tokens: 1000 })));
    const turn = new AiTurnControl();
    const result = await aiRouterComplete({ ...request, supabase: fakeDb(), turnControl: turn });
    expect(result.costRealEur).toBe(0.0077);
    expect(result.costUsd).toBeCloseTo(0.0077 / 0.92, 10);
    expect(turn.snapshot()).toMatchObject({ reported_cost_usd: 0, provider_cost_complete: false, usage_complete: true });
  });

  it("blocks unknown costs without inventing a free call or retrying the provider", async () => {
    const fetcher = vi.fn(async () => reply({ prompt_tokens: 10000, completion_tokens: 1000 })); vi.stubGlobal("fetch", fetcher);
    const turn = new AiTurnControl();
    const supabase = fakeDb({ noWholesaleRate: true });
    await expect(aiRouterComplete({ ...request, supabase, turnControl: turn, guardProviderRequest: true, idempotencyKey: "unknown-price" })).rejects.toThrow("cost unavailable");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(supabase.entries.size).toBe(0);
    expect([...supabase.requests.values()][0]).toMatchObject({ state: "uncertain", attempts: [{ generation_id: "gen-test-not-real", cost_usd: null }] });
    expect(turn.snapshot().provider_cost_complete).toBe(false);
  });

  it("does not call the provider or charge a successful call when credit is denied", async () => {
    const fetcher = vi.fn(async () => reply({ cost: 1 })); vi.stubGlobal("fetch", fetcher);
    const supabase = fakeDb({ denyCredit: true });
    await expect(aiRouterComplete({ ...request, supabase })).rejects.toThrow("Credito insufficiente");
    expect(fetcher).not.toHaveBeenCalled();
    expect([...supabase.entries.values()].map(e => e.cost_billed_eur)).toEqual([0]);
  });

  it("a zero-charge credit denial does not poison a later funded retry", async () => {
    const options = { denyCredit: true }; const supabase = fakeDb(options);
    const fetcher = vi.fn(async () => reply({ prompt_tokens: 100, completion_tokens: 20, cost: 0.001 })); vi.stubGlobal("fetch", fetcher);
    const opts = { ...request, supabase, guardProviderRequest: true, idempotencyKey: "funded-later" };
    await expect(aiRouterComplete(opts)).rejects.toThrow("Credito insufficiente");
    expect(supabase.requests.size).toBe(0);
    options.denyCredit = false;
    expect((await aiRouterComplete(opts)).costBilledEur).toBeGreaterThan(0);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(supabase.entries.size).toBe(2);
    expect([...supabase.entries.keys()].some(k => k.startsWith("precheck_"))).toBe(true);
  });

  it("does not trigger another paid model call after a billing failure", async () => {
    const fetcher = vi.fn(async () => reply({ prompt_tokens: 100, completion_tokens: 20, cost: 0.001 })); vi.stubGlobal("fetch", fetcher);
    const turn = new AiTurnControl();
    await expect(aiRouterComplete({ ...request, supabase: fakeDb({ billingFailure: true }), turnControl: turn })).rejects.toThrow("billing ledger unavailable");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(turn.snapshot()).toMatchObject({ reported_cost_usd: 0.001, billed_cost_eur: 0 });
  });

  it("a cached answer neither calls OpenRouter nor touches the billing RPC", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const supabase = fakeDb({ cacheHit: true });
    const result = await aiRouterComplete({ ...request, supabase, cacheTtlDays: 7 });
    expect(result.prechargeReason).toBe("cache_hit");
    expect(result.costBilledEur).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("replays a guarded request without another provider call or wallet debit", async () => {
    const fetcher = vi.fn(async () => reply({ prompt_tokens: 10000, completion_tokens: 1000, cost: 0.045 })); vi.stubGlobal("fetch", fetcher);
    const supabase = fakeDb(); const turn = new AiTurnControl();
    const opts = { ...request, supabase, turnControl: turn, idempotencyKey: "same-request-same-iteration", guardProviderRequest: true };
    const first = await aiRouterComplete(opts); const replay = await aiRouterComplete(opts);
    expect(supabase.entries.size).toBe(1);
    expect(first.costBilledEur).toBe(0.1242);
    expect(replay.costBilledEur).toBe(0);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(replay.idempotentReplay).toBe(true);
    expect(turn.snapshot()).toMatchObject({ provider_attempts: 1, reported_cost_usd: 0.045, billed_cost_eur: 0.1242 });
  });

  it("sums three tool iterations with the correct cost and unique billing keys", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ prompt_tokens: 10000, completion_tokens: 1000, cost: 0.045 })));
    const supabase = fakeDb(); const turn = new AiTurnControl();
    for (let i = 0; i < 3; i++) await aiRouterComplete({ ...request, supabase, turnControl: turn, idempotencyKey: `test-message-iteration-${i}` });
    expect(turn.snapshot().reported_cost_usd).toBeCloseTo(0.135, 10);
    expect(turn.snapshot().billed_cost_eur).toBeCloseTo(0.3726, 10);
    expect(supabase.entries.size).toBe(3);
  });

  it("admits only one provider call for concurrent identical requests", async () => {
    let release!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve; })); vi.stubGlobal("fetch", fetcher);
    const opts = { ...request, supabase: fakeDb(), guardProviderRequest: true, idempotencyKey: "concurrent-request" };
    const first = aiRouterComplete(opts);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await expect(aiRouterComplete(opts)).rejects.toThrow("in_progress");
    release(reply({ prompt_tokens: 100, completion_tokens: 20, cost: 0.001 }));
    await first;
    expect(fetcher).toHaveBeenCalledOnce(); expect(opts.supabase.entries.size).toBe(1);
  });

  it("fails closed before spending if the persistent guard is unavailable", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(aiRouterComplete({ ...request, supabase: fakeDb({ guardUnavailable: true }),
      guardProviderRequest: true, idempotencyKey: "guard-unavailable" })).rejects.toThrow("claim_unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not replay business tool calls or bill them again", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "gen-test-tool", usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 },
      choices: [{ message: { content: "", tool_calls: [{ id: "call1", type: "function", function: { name: "create_quote", arguments: "{}" } }] } }] })));
    vi.stubGlobal("fetch", fetcher);
    const opts = { ...request, supabase: fakeDb(), guardProviderRequest: true, idempotencyKey: "tool-request" };
    const result = await aiRouterComplete(opts);
    expect(result.rawResponse.choices[0].message.tool_calls).toHaveLength(1);
    await expect(aiRouterComplete(opts)).rejects.toThrow("tool_replay_requires_recovery");
    expect(fetcher).toHaveBeenCalledOnce(); expect(opts.supabase.entries.size).toBe(1);
  });

  it("rejects a reused key with different content", async () => {
    const fetcher = vi.fn(async () => reply({ prompt_tokens: 100, completion_tokens: 20, cost: 0.001 })); vi.stubGlobal("fetch", fetcher);
    const opts = { ...request, supabase: fakeDb(), guardProviderRequest: true, idempotencyKey: "conflicting-request" };
    await aiRouterComplete(opts);
    await expect(aiRouterComplete({ ...opts, messages: [{ role: "user", content: "different" }] })).rejects.toThrow("request_conflict");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("isolates identical caller keys by company and user, including wallet keys", async () => {
    const fetcher = vi.fn(async () => reply({ prompt_tokens: 100, completion_tokens: 20, cost: 0.001 })); vi.stubGlobal("fetch", fetcher);
    const opts = { ...request, supabase: fakeDb(), guardProviderRequest: true, idempotencyKey: "same-external-key" };
    await aiRouterComplete(opts);
    await aiRouterComplete({ ...opts, companyId: "another-company" });
    await aiRouterComplete({ ...opts, userId: "another-user" });
    expect(fetcher).toHaveBeenCalledTimes(3); expect(opts.supabase.entries.size).toBe(3);
  });

  it("stops every fallback on HTTP 402 and persists the provider cooldown", async () => {
    const fetcher = vi.fn(async () => new Response("Insufficient credits", { status: 402 })); vi.stubGlobal("fetch", fetcher);
    const opts = { ...request, supabase: fakeDb(), guardProviderRequest: true, idempotencyKey: "provider-empty" };
    await expect(aiRouterComplete(opts)).rejects.toThrow("OpenRouter 402");
    await expect(aiRouterComplete({ ...opts, idempotencyKey: "another-request" })).rejects.toThrow("OpenRouter 402");
    expect(fetcher).toHaveBeenCalledOnce(); expect(opts.supabase.entries.size).toBe(0);
  });

  it("also stops fallback when provider returns a 402 inside HTTP 200 JSON", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: 402, message: "credits" } }))); vi.stubGlobal("fetch", fetcher);
    await expect(aiRouterComplete({ ...request, supabase: fakeDb() })).rejects.toThrow("OpenRouter 402");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not retry a guarded request after an unknown network outcome", async () => {
    const fetcher = vi.fn(async () => { throw new Error("connection closed after sending request"); }); vi.stubGlobal("fetch", fetcher);
    const opts = { ...request, supabase: fakeDb(), guardProviderRequest: true, idempotencyKey: "unknown-outcome" };
    await expect(aiRouterComplete(opts)).rejects.toThrow("provider_outcome_unknown");
    await expect(aiRouterComplete(opts)).rejects.toThrow("uncertain");
    expect(fetcher).toHaveBeenCalledOnce();
    expect([...opts.supabase.requests.values()][0].attempts).toMatchObject([{ status: "unknown", cost_usd: null }]);
  });

  it("stops the batch on a 402 event inside an HTTP 200 SSE stream", async () => {
    const wire = 'data: {"error":{"code":402,"message":"Insufficient credits"}}\n\ndata: [DONE]\n\n';
    const fetcher = vi.fn(async () => new Response(wire, { headers: { "Content-Type": "text/event-stream" } })); vi.stubGlobal("fetch", fetcher);
    const opts = { ...request, supabase: fakeDb(), guardProviderRequest: true, idempotencyKey: "stream-credit", onDelta: vi.fn() };
    await expect(aiRouterComplete(opts)).rejects.toThrow("OpenRouter 402");
    await expect(aiRouterComplete({ ...opts, idempotencyKey: "next-stream" })).rejects.toThrow("OpenRouter 402");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("treats a JSON wallet rejection as a billing failure even with HTTP 200", async () => {
    const fetcher = vi.fn(async () => reply({ prompt_tokens: 100, completion_tokens: 20, cost: 0.001 })); vi.stubGlobal("fetch", fetcher);
    await expect(aiRouterComplete({ ...request, supabase: fakeDb({ billingRejected: true }) })).rejects.toThrow("billing ledger unavailable");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not re-spend if saving the completed response fails after billing", async () => {
    const fetcher = vi.fn(async () => reply({ prompt_tokens: 100, completion_tokens: 20, cost: 0.001 })); vi.stubGlobal("fetch", fetcher);
    const opts = { ...request, supabase: fakeDb({ finishFailure: true }), guardProviderRequest: true, idempotencyKey: "lost-save" };
    await expect(aiRouterComplete(opts)).rejects.toThrow("completion_unavailable");
    await expect(aiRouterComplete(opts)).rejects.toThrow("in_progress");
    expect(fetcher).toHaveBeenCalledOnce(); expect(opts.supabase.entries.size).toBe(1);
  });

  it("stops without fallback if the provider usage checkpoint cannot be saved", async () => {
    const fetcher = vi.fn(async () => reply({ prompt_tokens: 100, completion_tokens: 20, cost: 0.001 })); vi.stubGlobal("fetch", fetcher);
    const opts = { ...request, supabase: fakeDb({ checkpointFailure: true }), guardProviderRequest: true, idempotencyKey: "lost-checkpoint" };
    await expect(aiRouterComplete(opts)).rejects.toThrow("checkpoint_unavailable");
    await expect(aiRouterComplete(opts)).rejects.toThrow("uncertain");
    expect(fetcher).toHaveBeenCalledOnce(); expect(opts.supabase.entries.size).toBe(0);
  });

  it("cannot estimate a zero-price call from a response without usage", async () => {
    const fetcher = vi.fn(async () => reply({})); vi.stubGlobal("fetch", fetcher);
    await expect(aiRouterComplete({ ...request, supabase: fakeDb() })).rejects.toThrow("cost unavailable");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("retains discarded paid attempts separately from the single company bill", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({ prompt_tokens: 100, completion_tokens: 6000, cost: 0.04 }, ""))
      .mockImplementation(() => reply({ prompt_tokens: 100, completion_tokens: 20, cost: 0.001 }));
    vi.stubGlobal("fetch", fetcher);
    const supabase = fakeDb();
    await aiRouterComplete({ ...request, supabase, guardProviderRequest: true, idempotencyKey: "empty-paid-answer" });
    const attempts = [...supabase.requests.values()][0].attempts as Array<{ cost_usd: number }>;
    expect(attempts).toHaveLength(2);
    expect(attempts.reduce((sum, a) => sum + a.cost_usd, 0)).toBeCloseTo(0.041);
    expect(supabase.entries.size).toBe(1);
  });

  it("preserves provider cost provenance in billing metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ prompt_tokens: 100, completion_tokens: 20, cost: 0 })));
    const supabase = fakeDb();
    await aiRouterComplete({ ...request, supabase, guardProviderRequest: true, idempotencyKey: "cost-provenance" });
    expect(supabase.rpc.mock.calls.find(c => c[0] === "charge_ai_call")![1]!.p_metadata).toMatchObject({
      cost_source: "provider", provider_cost_complete: true, usage_complete: true, generation_id: "gen-test-not-real",
      provider_request_key: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
});
