import { describe, expect, it, vi } from "vitest";
import { BriefingAiGate } from "../../../supabase/functions/_shared/briefingAiGate";
import { AiProviderCreditError } from "../../../supabase/functions/_shared/aiRequestGuard";

describe("automatic briefing provider safety", () => {
  it("uses deterministic alerts for 50 users after the first credit error", async () => {
    const gate = new BriefingAiGate();
    const ai = vi.fn(async () => { throw new AiProviderCreditError(); });
    for (let i = 0; i < 50; i++) expect(await gate.compose(ai, () => `Alert ${i}`)).toBe(`Alert ${i}`);
    expect(ai).toHaveBeenCalledOnce(); expect(gate.providerPaused).toBe(true);
  });
  it("does not label unrelated errors as a provider credit shortage", async () => {
    const gate = new BriefingAiGate();
    expect(await gate.compose(async () => { throw new Error("invalid output"); }, () => "alerts")).toBe("alerts");
    expect(gate.providerPaused).toBe(false);
    expect(await gate.compose(async () => "next answer", () => "unused")).toBe("next answer");
  });
});
