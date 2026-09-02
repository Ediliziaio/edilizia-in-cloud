import { describe, it, expect } from "vitest";
import { spostaFuoriWeekend } from "../../../supabase/functions/_shared/outreach-sequence";
import { warmupMessage, warmupReply } from "../../../supabase/functions/_shared/outreach-warmup";

describe("spostaFuoriWeekend", () => {
  it("sabato → lunedì, domenica → lunedì, feriale invariato (Europe/Rome)", () => {
    expect(spostaFuoriWeekend(new Date("2026-09-05T08:30:00Z")).toISOString()).toBe("2026-09-07T08:30:00.000Z"); // sabato
    expect(spostaFuoriWeekend(new Date("2026-09-06T08:30:00Z")).toISOString()).toBe("2026-09-07T08:30:00.000Z"); // domenica
    expect(spostaFuoriWeekend(new Date("2026-09-03T08:30:00Z")).toISOString()).toBe("2026-09-03T08:30:00.000Z"); // giovedì
  });
});

describe("warmupMessage", () => {
  it("nessuna graffa residua, testi diversi tra indici, riproducibile con rnd fisso", () => {
    const a = warmupMessage(1, () => 0.1), b = warmupMessage(2, () => 0.1);
    for (const m of [a, b]) {
      expect(m.subject).not.toMatch(/[{}|]/);
      expect(m.body).not.toMatch(/[{}|]/);
      expect(m.subject.length).toBeGreaterThan(3);
    }
    expect(a.subject).not.toBe(b.subject);
    expect(warmupMessage(1, () => 0.1)).toEqual(a);
    expect(warmupReply(() => 0.9)).not.toMatch(/[{}|]/);
  });
});
