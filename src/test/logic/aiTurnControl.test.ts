import { describe, expect, it, vi } from "vitest";
import { AiTurnControl, AiTurnLimitError } from "../../../supabase/functions/_shared/aiTurnControl";
import { effectiveOutputTokens, isReasoningModel, precheckOutputTokens } from "../../../supabase/functions/_shared/aiModelBudget";
import { createLatestStreamWriter } from "../../../supabase/functions/_shared/latestStreamWriter";

describe("AI turn limits and truthful accounting", () => {
  it("uses one deadline across model iterations", () => {
    let time = 0;
    const turn = new AiTurnControl({ durationMs: 5000 }, () => time);
    turn.beginAttempt(30, 2000);
    time = 4500;
    expect(turn.remainingMs()).toBe(500);
    expect(() => turn.beginAttempt(30, 2000)).toThrow(AiTurnLimitError);
  });
  it("counts unsuccessful attempts towards the common budget", () => {
    const turn = new AiTurnControl({ maxAttempts: 2 });
    turn.beginAttempt(30, 2000);
    turn.beginAttempt(30, 2000);
    expect(() => turn.beginAttempt(30, 2000)).toThrow("attempts");
    expect(turn.snapshot()).toMatchObject({ provider_attempts: 2, usage_complete: false, provider_cost_complete: false });
  });
  it("reserves effective output, not merely the requested tokens", () => {
    const turn = new AiTurnControl({ maxReservedOutputTokens: 6500 });
    turn.beginAttempt(30, effectiveOutputTokens("openai/gpt-5", 2500));
    expect(() => turn.beginAttempt(30, 1000)).toThrow("tokens");
    expect(turn.snapshot().reserved_output_tokens).toBe(6000);
  });
  it("bounds repeated prompt input without silently truncating user content", () => {
    const turn = new AiTurnControl({ maxEstimatedInputTokens: 100 });
    turn.beginAttempt(150, 100);
    expect(() => turn.beginAttempt(153, 100)).toThrow("tokens");
    expect(turn.snapshot().provider_attempts).toBe(1);
  });
  it("aggregates every observed usage including a discarded answer", () => {
    const turn = new AiTurnControl();
    const a = turn.beginAttempt(900, 2000);
    turn.recordUsage(a, { prompt_tokens: 300, completion_tokens: 50, cost: 0.01,
      prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 40 },
      completion_tokens_details: { reasoning_tokens: 20 } });
    turn.recordUsage(a, { prompt_tokens: 300, completion_tokens: 50, cost: 0.01 });
    const b = turn.beginAttempt(1200, 2000);
    turn.recordUsage(b, { prompt_tokens: 400, completion_tokens: 100, cost: 0 });
    turn.recordBilled(0.012);
    expect(turn.snapshot()).toMatchObject({ input_tokens: 700, output_tokens: 150,
      reported_cost_usd: 0.01, billed_cost_eur: 0.012, usage_complete: true,
      provider_cost_complete: true, cached_input_tokens: 200, cache_write_tokens: 40, reasoning_tokens: 20 });
  });
  it("does not call missing or invalid cost a complete provider total", () => {
    const turn = new AiTurnControl();
    turn.recordUsage(turn.beginAttempt(1, 1), { prompt_tokens: 1, completion_tokens: 1 });
    expect(turn.snapshot()).toMatchObject({ usage_complete: true, provider_cost_complete: false });
  });
  it("stops further calls at the observed cost threshold", () => {
    const turn = new AiTurnControl({ stopAfterObservedUsd: 0.1 });
    turn.recordUsage(turn.beginAttempt(10, 10), { cost: 0.1 });
    expect(() => turn.beginAttempt(10, 10)).toThrow("cost");
  });
  it("does not treat invalid token totals as complete usage", () => {
    const turn = new AiTurnControl();
    turn.recordUsage(turn.beginAttempt(1, 1), { prompt_tokens: -1, completion_tokens: NaN, cost: 0 });
    expect(turn.snapshot()).toMatchObject({ input_tokens: 0, output_tokens: 0, usage_complete: false });
  });
  it("tracks first stored text once and explicitly excludes external work", () => {
    let now = 100;
    const turn = new AiTurnControl({}, () => now);
    now = 150; turn.markStoredText();
    now = 300; turn.markStoredText();
    turn.exclude("council");
    expect(turn.snapshot()).toMatchObject({ elapsed_ms: 200, first_stored_text_ms: 50,
      excluded_scopes: ["embeddings", "tool_internal_ai", "background_memory", "council"] });
  });
  it("does not share state between tenants' turns", () => {
    const a = new AiTurnControl(); const b = new AiTurnControl();
    a.beginAttempt(10, 10);
    expect(b.snapshot().provider_attempts).toBe(0);
  });
});

describe("output budget policy", () => {
  it.each(["openai/gpt-5", "openai/gpt-5.1", "moonshotai/kimi-k2.5", "deepseek/deepseek-r1", "anthropic/claude-sonnet-4.5:thinking"])("includes reasoning for %s", model => {
    expect(isReasoningModel(model)).toBe(true);
    expect(effectiveOutputTokens(model, 2500)).toBe(6000);
  });
  it.each(["openai/gpt-4o-mini", "openai/gpt-5-chat", "openai/gpt-5.1-chat", "anthropic/claude-sonnet-4.5"])("keeps the requested limit for %s", model => {
    expect(isReasoningModel(model)).toBe(false);
    expect(effectiveOutputTokens(model, 2500)).toBe(2500);
  });
  it("prechecks the largest limit in the fallback chain", () => {
    expect(precheckOutputTokens(["openai/gpt-4o-mini", "openai/gpt-5"], 2500)).toBe(6000);
    expect(precheckOutputTokens(["openai/gpt-5"], 8000)).toBe(8000);
    expect(precheckOutputTokens(["openai/gpt-4o-mini"], 500)).toBe(500);
    expect(precheckOutputTokens([], undefined)).toBe(2000);
  });
});

describe("stream write backpressure", () => {
  it("keeps only the latest pending snapshot while a write is slow", async () => {
    let release!: () => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise<void>(r => { release = r; })).mockResolvedValue(undefined);
    const queue = createLatestStreamWriter(write, vi.fn());
    queue.push("first"); await Promise.resolve();
    for (let i = 0; i < 100; i++) queue.push(`text ${i}`);
    expect(write).toHaveBeenCalledTimes(1);
    release(); await queue.flush();
    expect(write.mock.calls.map(c => c[0])).toEqual(["first", "text 99"]);
  });
  it("flushes before a final save and recovers from a failed partial write", async () => {
    const errors = vi.fn();
    const write = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const queue = createLatestStreamWriter(write, errors);
    queue.push("partial"); await queue.flush();
    queue.push("recovered"); await queue.flush();
    expect(errors).toHaveBeenCalledOnce();
    expect(write).toHaveBeenLastCalledWith("recovered");
  });
});
