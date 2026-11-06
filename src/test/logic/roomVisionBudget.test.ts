import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../../../supabase/functions/_shared/ai-provider/openrouter.ts", () => ({ callOpenRouter: mock.call }));
import { callVisionQa } from "../../../supabase/functions/_shared/ai-provider/visionQa.ts";
const args = { sourceImageDataUrl: "data:image/png;base64,AA", candidateImageDataUrl: "data:image/png;base64,BB", qaPrompt: "compare", metadata: { task_kind: "render_image_qa" }, models: ["one", "two"] };
beforeEach(() => { mock.call.mockReset(); mock.call.mockResolvedValue({ content: '{"pass":true,"issues":[]}' }); });
afterEach(() => { vi.useRealTimers(); });

describe("budget del controllo visivo", () => {
  it("il limite esplicito è trasmesso al client che interrompe la richiesta HTTP", async () => {
    expect((await callVisionQa({ ...args, timeoutMs: 2_000 })).pass).toBe(true);
    const controllo = mock.call.mock.calls[0][1].turnControl;
    expect(controllo.remainingMs()).toBeGreaterThan(0);
    expect(controllo.remainingMs()).toBeLessThanOrEqual(2_000);
  });
  it("una catena lenta non riparte con un nuovo budget per ogni modello", async () => {
    vi.useFakeTimers();
    mock.call.mockImplementationOnce(async () => { await vi.advanceTimersByTimeAsync(2_500); throw new Error("provider lento"); });
    const result = await callVisionQa({ ...args, timeoutMs: 2_000 });
    expect(result.checked).toBe(false);
    expect(mock.call).toHaveBeenCalledTimes(1);
  });
  it("gli altri render senza limite esplicito conservano il comportamento precedente", async () => {
    await callVisionQa(args);
    expect(mock.call.mock.calls[0][1]).not.toHaveProperty("turnControl");
  });
});
