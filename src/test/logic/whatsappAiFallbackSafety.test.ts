import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: {}, precheck: vi.fn(), charge: vi.fn(), config: vi.fn(), provider: vi.fn() }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => mocks.db }));
vi.mock("../../../supabase/functions/_shared/ai-provider/billing.ts", () => ({ precallCheck: mocks.precheck, chargeAndLog: mocks.charge }));
vi.mock("../../../supabase/functions/_shared/ai-provider/config.ts", () => ({ resolveModelConfig: mocks.config }));
vi.mock("../../../supabase/functions/_shared/ai-provider/openrouter.ts", () => ({ callOpenRouter: mocks.provider }));
import { chat } from "../../../supabase/functions/_shared/ai-provider/index";
import { makeAIError } from "../../../supabase/functions/_shared/ai-provider/types";

describe("WhatsApp AI loop does not re-spend after uncertain results", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", { env: { get: () => "fake" } }); vi.resetAllMocks();
    mocks.precheck.mockResolvedValue({ allow: true });
    mocks.config.mockResolvedValue({ enabled: true, primary_model: "first", fallback_chain: ["second"], max_tokens: 4000 });
    mocks.charge.mockResolvedValue({ charged: true, cost_real_eur: 0.1234 });
    mocks.provider.mockResolvedValue({ model: "first", content: "test", usage: { prompt_tokens: 10, completion_tokens: 5 }, cost_usd: 0.13 });
  });
  afterEach(() => vi.unstubAllGlobals());
  const req = { task_kind: "default" as const, company_id: "fake", messages: [{ role: "user" as const, content: "test" }] };
  it("blocks tools/answers when billing was rejected without trying the fallback", async () => {
    mocks.charge.mockResolvedValue({ charged: false, reason: "rpc_error" });
    await expect(chat(req)).rejects.toThrow("billing not confirmed");
    expect(mocks.provider).toHaveBeenCalledOnce(); expect(mocks.charge).toHaveBeenCalledOnce();
  });
  it.each(["provider_credits_exhausted", "provider_outcome_unknown", "timeout", "cost_unavailable", "unknown"] as const)("does not fall back on %s", async code => {
    mocks.provider.mockRejectedValue(makeAIError(code, "fake failure", false));
    await expect(chat(req)).rejects.toMatchObject({ code });
    expect(mocks.provider).toHaveBeenCalledOnce(); expect(mocks.charge).not.toHaveBeenCalled();
  });
  it("can select another model after a definite model-not-found rejection", async () => {
    mocks.provider.mockRejectedValueOnce(makeAIError("model_not_found", "missing", false));
    const result = await chat(req);
    expect(result.fallback_hops).toBe(1); expect(mocks.provider).toHaveBeenCalledTimes(2);
    expect(mocks.charge).toHaveBeenCalledOnce();
  });
  it("reports the cost in EUR saved by billing, without a second FX conversion", async () => {
    expect(await chat(req)).toMatchObject({ cost_real_eur: 0.1234, cost_usd: 0.13 });
  });
  it("includes the input and tool definitions in the credit precheck estimate", async () => {
    await chat({ ...req, messages: [{ role: "user", content: "x".repeat(10000) }], max_tokens: 800 });
    expect(mocks.precheck.mock.calls[0][1].estimated_tokens_total).toBeGreaterThan(3300);
  });
  it("does not send a disabled task to any provider", async () => {
    mocks.config.mockResolvedValue({ enabled: false });
    await expect(chat(req)).rejects.toThrow("disabilitato"); expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("uses the configured output budget when the request does not override it", async () => {
    await chat(req);
    expect(mocks.precheck.mock.calls[0][1].estimated_tokens_total).toBeGreaterThan(4000);
    expect(mocks.provider.mock.calls[0][0].max_tokens).toBe(4000);
  });
});
