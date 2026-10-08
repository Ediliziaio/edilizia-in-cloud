import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiTurnControl } from "../../../supabase/functions/_shared/aiTurnControl";
vi.mock("../../../supabase/functions/_shared/requirePaymentMethod.ts", () => ({ checkPaymentMethod: vi.fn(async () => ({ allowed: true })) }));
vi.mock("../../../supabase/functions/_shared/allarmeAI.ts", () => ({ segnalaErroreAI: vi.fn() }));
import { aiRouterComplete } from "../../../supabase/functions/_shared/aiRouter";

function db(primary = "openai/gpt-5", fallbacks: string[] = []) {
  const insert = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) => {
    if (name === "get_ai_router_config") return { data: { primary_model: primary, fallback_models: fallbacks, default_params: {}, tier_key: "test" } };
    if (name === "precheck_ai_credit") return { data: { ok: true } };
    if (name === "charge_ai_call") return { data: { success: true, ledger_id: "ledger", cost_billed_eur: 0.02 } };
    return { data: null };
  });
  return { rpc, from: vi.fn(() => ({ insert })), insert };
}
const answer = (cost = 0.01) => new Response(JSON.stringify({ id: "generation-test", choices: [{ message: { content: "Risposta" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 100, completion_tokens: 50, cost, prompt_tokens_details: { cache_write_tokens: 10 } } }), { headers: { "Content-Type": "application/json" } });

describe("router performance controls (fake provider, no paid calls)", () => {
  beforeEach(() => vi.stubGlobal("Deno", { env: { get: (key: string) => key === "OPENROUTER_API_KEY" ? "test-not-a-secret" : undefined } }));
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("uses the same reasoning output limit in precheck and actual request", async () => {
    const supabase = db(); const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => answer()); vi.stubGlobal("fetch", fetcher);
    const turn = new AiTurnControl();
    await aiRouterComplete({ supabase, taskKey: "persona_silvio", companyId: "company", userId: "user", messages: [{ role: "user", content: "Ciao" }],
      params: { max_tokens: 2500 }, turnControl: turn, sessionId: "opaque-session" });
    const precheck = supabase.rpc.mock.calls.find(c => c[0] === "precheck_ai_credit")!;
    expect(precheck[1]).toMatchObject({ p_tokens_out: 6000 });
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({ max_tokens: 6000, session_id: "opaque-session" });
    expect(turn.snapshot()).toMatchObject({ input_tokens: 100, output_tokens: 50, billed_cost_eur: 0.02, cache_write_tokens: 10 });
  });
  it("preserves an explicitly zero provider price instead of estimating a paid price", async () => {
    const supabase = db(); vi.stubGlobal("fetch", vi.fn(async () => answer(0)));
    const result = await aiRouterComplete({ supabase, taskKey: "test", messages: [{ role: "user", content: "test" }] });
    expect(result.costUsd).toBe(0);
    expect(supabase.from).not.toHaveBeenCalledWith("ai_pricing_tiers");
  });
  it("cannot reset the attempt limit through a retry or fallback", async () => {
    vi.useFakeTimers();
    const supabase = db("anthropic/claude-sonnet-4.5", ["openai/gpt-4o-mini"]);
    const fetcher = vi.fn(async () => new Response("unavailable", { status: 503 })); vi.stubGlobal("fetch", fetcher);
    const turn = new AiTurnControl({ maxAttempts: 1 });
    const result = aiRouterComplete({ supabase, taskKey: "test", messages: [{ role: "user", content: "test" }], turnControl: turn });
    const assertion = expect(result).rejects.toThrow("attempts");
    await vi.runAllTimersAsync(); await assertion;
    expect(fetcher).toHaveBeenCalledOnce();
    expect(turn.snapshot()).toMatchObject({ provider_attempts: 1, usage_complete: false });
  });
  it("aggregates tool iterations while retaining per-call billing", async () => {
    const supabase = db(); vi.stubGlobal("fetch", vi.fn(async () => answer()));
    const turn = new AiTurnControl();
    for (let i = 0; i < 3; i++) await aiRouterComplete({ supabase, taskKey: "persona_silvio", companyId: "company", userId: "user",
      idempotencyKey: `request-iteration-${i}`, messages: [{ role: "user", content: "test" }], turnControl: turn });
    expect(turn.snapshot()).toMatchObject({ provider_attempts: 3, input_tokens: 300, output_tokens: 150, billed_cost_eur: 0.06 });
    expect(supabase.rpc.mock.calls.filter(c => c[0] === "charge_ai_call")).toHaveLength(3);
  });
  it("does not restart the deadline for a retry or fallback", async () => {
    vi.useFakeTimers();
    let now = 0;
    const turn = new AiTurnControl({ durationMs: 5000 }, () => now);
    const fetcher = vi.fn(async () => { now = 5000; return new Response("unavailable", { status: 503 }); });
    vi.stubGlobal("fetch", fetcher);
    const result = aiRouterComplete({ supabase: db("anthropic/claude-sonnet-4.5", ["openai/gpt-4o-mini"]),
      taskKey: "test", messages: [{ role: "user", content: "test" }], turnControl: turn });
    const assertion = expect(result).rejects.toThrow("time");
    await vi.runAllTimersAsync(); await assertion;
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("includes paid usage from an empty answer discarded before fallback", async () => {
    const empty = new Response(JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "length" }],
      usage: { prompt_tokens: 200, completion_tokens: 6000, cost: 0.04 } }));
    const fetcher = vi.fn().mockResolvedValueOnce(empty).mockImplementation(() => answer());
    vi.stubGlobal("fetch", fetcher);
    const turn = new AiTurnControl();
    await aiRouterComplete({ supabase: db("openai/gpt-5", ["openai/gpt-4o-mini"]), taskKey: "test",
      messages: [{ role: "user", content: "test" }], turnControl: turn });
    expect(turn.snapshot()).toMatchObject({ provider_attempts: 2, input_tokens: 300, output_tokens: 6050,
      reported_cost_usd: 0.05, usage_complete: true, provider_cost_complete: true });
  });
  it("includes tool-call arguments in the input budget even when content is empty", async () => {
    const fetcher = vi.fn(async () => answer()); vi.stubGlobal("fetch", fetcher);
    const turn = new AiTurnControl({ maxEstimatedInputTokens: 100 });
    const messages = [{ role: "assistant" as const, content: "", tool_calls: [{ id: "tool-1", type: "function",
      function: { name: "example", arguments: JSON.stringify({ text: "x".repeat(1000) }) } }] }];
    await expect(aiRouterComplete({ supabase: db(), taskKey: "test", messages, turnControl: turn })).rejects.toThrow("tokens");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("delivers real streamed text and collects usage from the final SSE event", async () => {
    const events = [
      { id: "stream-test", choices: [{ index: 0, delta: { role: "assistant", content: "Ciao" } }] },
      { choices: [{ index: 0, delta: { content: ", ecco i dati." }, finish_reason: "stop" }] },
      { choices: [], usage: { prompt_tokens: 120, completion_tokens: 20, cost: 0.003 } },
    ];
    const wire = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(wire, { headers: { "Content-Type": "text/event-stream" } })));
    const turn = new AiTurnControl(); const onDelta = vi.fn();
    const result = await aiRouterComplete({ supabase: db("openai/gpt-4o-mini"), taskKey: "test",
      messages: [{ role: "user", content: "test" }], turnControl: turn, onDelta });
    expect(onDelta.mock.calls.map(c => c[0])).toEqual(["Ciao", "Ciao, ecco i dati."]);
    expect(result.content).toBe("Ciao, ecco i dati.");
    expect(turn.snapshot()).toMatchObject({ input_tokens: 120, output_tokens: 20, reported_cost_usd: 0.003, usage_complete: true });
  });
});
