import { describe, it, expect } from "vitest";

// P2-4: il helper vive in supabase/functions/_shared/extractJson.ts.
// Importiamo il modulo direttamente (Vitest supporta path relativi).
import { extractJsonFromLLM } from "../../../supabase/functions/_shared/extractJson";

describe("extractJsonFromLLM (P2-4)", () => {
  it("parsa JSON raw semplice", () => {
    expect(extractJsonFromLLM('{"a":1}')).toEqual({ a: 1 });
  });

  it("parsa fence ```json ... ```", () => {
    const raw = "```json\n{\"a\":1,\"b\":[true,false]}\n```";
    expect(extractJsonFromLLM(raw)).toEqual({ a: 1, b: [true, false] });
  });

  it("parsa fence ``` ... ``` senza lingua", () => {
    const raw = "```\n{\"ok\":true}\n```";
    expect(extractJsonFromLLM(raw)).toEqual({ ok: true });
  });

  it("parsa con testo prima e dopo la fence", () => {
    const raw = 'Ecco il preventivo:\n```json\n{"items":[{"id":1}]}\n```\nSpero sia utile!';
    expect(extractJsonFromLLM(raw)).toEqual({ items: [{ id: 1 }] });
  });

  it("parsa array top-level", () => {
    expect(extractJsonFromLLM("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("parsa JSON object dentro prosa senza fence", () => {
    const raw = 'Risposta: {"status":"ok"} grazie.';
    expect(extractJsonFromLLM(raw)).toEqual({ status: "ok" });
  });

  it("lancia su input non JSON", () => {
    expect(() => extractJsonFromLLM("solo testo senza JSON")).toThrow(/non estraibile/i);
  });

  it("lancia su stringa vuota", () => {
    expect(() => extractJsonFromLLM("")).toThrow();
  });

  it("lancia su null", () => {
    // @ts-expect-error: testiamo intentionally input invalido
    expect(() => extractJsonFromLLM(null)).toThrow();
  });
});
