import { describe, it, expect } from "vitest";
import { warmupTargetForDay, buildWarmupPairs, type WarmupBox } from "../../../supabase/functions/_shared/outreach-warmup";

function box(p: Partial<WarmupBox> & { id: string }): WarmupBox {
  return { email: `${p.id}@x.it`, warmup_day: 0, status: "warming", ...p };
}

describe("warmupTargetForDay", () => {
  it("giorno 0 = base", () => { expect(warmupTargetForDay(0)).toBe(2); });
  it("cresce di step/giorno", () => { expect(warmupTargetForDay(3)).toBe(5); }); // 2 + 3
  it("cappa al max", () => { expect(warmupTargetForDay(100)).toBe(8); });
  it("giorni negativi → base", () => { expect(warmupTargetForDay(-5)).toBe(2); });
});

describe("buildWarmupPairs", () => {
  it("ogni casella manda alle altre, mai a se stessa", () => {
    const boxes = [box({ id: "a" }), box({ id: "b" }), box({ id: "c" })];
    const pairs = buildWarmupPairs(boxes, 1);
    expect(pairs).toHaveLength(3); // a→b, b→c, c→a
    expect(pairs.every((p) => p.fromId !== p.toId)).toBe(true);
  });
  it("count capped al numero di altre caselle", () => {
    const boxes = [box({ id: "a" }), box({ id: "b" })];
    const pairs = buildWarmupPairs(boxes, 10); // solo 1 altra casella ciascuna
    expect(pairs).toHaveLength(2); // a→b, b→a
  });
  it("meno di 2 caselle → nessuna coppia", () => {
    expect(buildWarmupPairs([box({ id: "a" })], 5)).toEqual([]);
  });
  it("ignora caselle in pausa/disabilitate", () => {
    const boxes = [box({ id: "a" }), box({ id: "b", status: "paused" }), box({ id: "c", status: "disabled" })];
    expect(buildWarmupPairs(boxes, 1)).toEqual([]); // solo 'a' attiva → <2
  });
  it("count variabile per casella (in base al warmup_day)", () => {
    const boxes = [box({ id: "a", warmup_day: 0 }), box({ id: "b", warmup_day: 0 }), box({ id: "c", warmup_day: 0 })];
    const pairs = buildWarmupPairs(boxes, (b) => (b.id === "a" ? 2 : 1));
    const fromA = pairs.filter((p) => p.fromId === "a");
    const fromB = pairs.filter((p) => p.fromId === "b");
    expect(fromA).toHaveLength(2); // a manda a 2 altre
    expect(fromB).toHaveLength(1); // b manda a 1
  });
});
