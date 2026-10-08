import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiTurnControl } from "../../../supabase/functions/_shared/aiTurnControl";
import { whatsappAiSessionKey, whatsappPromptContext } from "../../../supabase/functions/_shared/whatsappPromptContext";
vi.mock("../../../supabase/functions/_shared/allarmeAI.ts", () => ({ segnalaErroreAI: vi.fn() }));
import { callOpenRouter } from "../../../supabase/functions/_shared/ai-provider/openrouter";
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Deno", { env: { get: (key: string) => key === "OPENROUTER_API_KEY" ? "fake" : undefined } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const answer = () => new Response(JSON.stringify({ id: "generation-test", choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, cost: 0.005,
    prompt_tokens_details: { cached_tokens: 800, cache_write_tokens: 100 }, completion_tokens_details: { reasoning_tokens: 20 } } }));
const params = { model: "fake/model", messages: [{ role: "system", content: "Stable test" }], max_tokens: 800 };
describe("WhatsApp chat prompt and provider-loop performance", () => {
  it("keeps time and triage out of the stable instruction prefix", () => {
    const first = whatsappPromptContext("Stable security and instructions", "2026-10-08 08:00; quote request");
    const second = whatsappPromptContext("Stable security and instructions", "2026-10-08 08:01; report request");
    expect(first[0]).toEqual(second[0]); expect(first[1]).not.toEqual(second[1]);
    expect(first.every(m => m.role === "system")).toBe(true);
  });
  it("separates provider sessions by company, actor, number, role and conversation without exposing PII", async () => {
    const key = () => whatsappAiSessionKey("company", "actor", "number", "session", "admin", "message");
    const first = await key(); expect(first).toMatch(/^[a-f0-9]{64}$/); expect(await key()).toBe(first);
    for (const changed of [
      ["other", "actor", "number", "session", "admin", "message"],
      ["company", "other", "number", "session", "admin", "message"],
      ["company", "actor", "other", "session", "admin", "message"],
      ["company", "actor", "number", "other", "admin", "message"],
      ["company", "actor", "number", "session", "ufficio", "message"],
    ] as const) expect(await whatsappAiSessionKey(changed[0], changed[1], changed[2], changed[3], changed[4], changed[5])).not.toBe(first);
    expect(await whatsappAiSessionKey("company", "actor", "number", null, "admin", "next-message"))
      .not.toBe(await whatsappAiSessionKey("company", "actor", "number", null, "admin", "message"));
  });
  it("aggregates real usage/cache/reasoning across tool iterations without changing real provider cost", async () => {
    const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => answer()); vi.stubGlobal("fetch", fetcher);
    const turn = new AiTurnControl();
    for (let n = 0; n < 3; n++) await callOpenRouter(params, { task_kind: "test", turnControl: turn });
    expect(turn.snapshot()).toMatchObject({ provider_attempts: 3, input_tokens: 3000, output_tokens: 300,
      cached_input_tokens: 2400, cache_write_tokens: 300, reasoning_tokens: 60, reported_cost_usd: 0.015,
      usage_complete: true, provider_cost_complete: true });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).not.toHaveProperty("turnControl");
  });
  it("shares the attempt budget with 429 retries instead of resetting on each iteration", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Response("rate limit", { status: 429 })); vi.stubGlobal("fetch", fetcher);
    const turn = new AiTurnControl({ maxAttempts: 1 });
    const pending = callOpenRouter(params, { task_kind: "test", turnControl: turn });
    const rejected = expect(pending).rejects.toThrow("attempts"); await vi.runAllTimersAsync(); await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(turn.snapshot()).toMatchObject({ provider_attempts: 1, usage_complete: false });
  });
  it("stops a new call after observed spend but does not pretend the cap guaranteed the previous cost", async () => {
    const fetcher = vi.fn(async () => answer()); vi.stubGlobal("fetch", fetcher);
    const turn = new AiTurnControl({ stopAfterObservedUsd: 0.004 });
    await callOpenRouter(params, { task_kind: "test", turnControl: turn });
    await expect(callOpenRouter(params, { task_kind: "test", turnControl: turn })).rejects.toThrow("cost");
    expect(fetcher).toHaveBeenCalledOnce(); expect(turn.snapshot().reported_cost_usd).toBe(0.005);
  });
  it("preserves the deadline across retries and clips the provider timeout", async () => {
    vi.useFakeTimers(); let now = 0;
    const turn = new AiTurnControl({ durationMs: 2000 }, () => now);
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => ({ ok: true, status: 200,
      json: () => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))) }));
    vi.stubGlobal("fetch", fetcher);
    const rejected = expect(callOpenRouter(params, { task_kind: "test", turnControl: turn })).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(2001); await rejected;
    now = 2000;
    await expect(callOpenRouter(params, { task_kind: "test", turnControl: turn })).rejects.toThrow("time");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("accounts for tool schemas and arguments, not only readable user text", async () => {
    const fetcher = vi.fn(async () => answer()); vi.stubGlobal("fetch", fetcher);
    const turn = new AiTurnControl({ maxEstimatedInputTokens: 100 });
    await expect(callOpenRouter({ ...params, tools: [{ description: "x".repeat(1000) }] }, { task_kind: "test", turnControl: turn })).rejects.toThrow("tokens");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
