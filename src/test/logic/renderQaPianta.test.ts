import { beforeEach, describe, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => vi.fn());
vi.mock("../../../supabase/functions/_shared/ai-provider/openrouter.ts", () => ({ callOpenRouter: provider }));
import { callVisionQa } from "../../../supabase/functions/_shared/ai-provider/visionQa.ts";
const args = { sourceImageDataUrl: "sorgente", candidateImageDataUrl: "candidato", qaPrompt: "confronta le aperture", metadata: { task_kind: "render_image_qa" }, requireExplicitPass: true, models: ["modello-a", "modello-b"] };

describe("verifica esplicita del render da pianta", () => {
  beforeEach(() => { provider.mockReset(); });
  it.each([{}, { pass: "true" }, { issues: [] }])("una risposta senza verdetto booleano non promuove il render: %s", async (risposta) => {
    provider.mockResolvedValue({ content: JSON.stringify(risposta), model: "modello-a" });
    expect((await callVisionQa(args)).checked).toBe(false);
  });
  it("un controllo positivo esplicito è una verifica valida", async () => {
    provider.mockResolvedValue({ content: '{"pass":true,"issues":[]}', model: "modello-a" });
    expect(await callVisionQa(args)).toMatchObject({ checked: true, pass: true });
  });
  it("dopo il credito provider esaurito non tenta altri modelli dello stesso conto", async () => {
    provider.mockRejectedValue(new Error("OpenRouter 402: credito provider insufficiente"));
    expect((await callVisionQa(args)).checked).toBe(false);
    expect(provider).toHaveBeenCalledOnce();
  });
});
