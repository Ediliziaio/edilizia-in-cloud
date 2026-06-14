import { describe, it, expect } from "vitest";
import {
  effectiveDailyCap, sentToday, remainingToday, totalCapacity, shouldAutoPause, assignSenders,
  type SenderState,
} from "../../../supabase/functions/_shared/outreach-dispatch-logic";

const TODAY = "2026-06-14";

function sender(p: Partial<SenderState> = {}): SenderState {
  return {
    id: p.id ?? "s1",
    status: p.status ?? "active",
    daily_cap_target: p.daily_cap_target ?? 40,
    warmup_base: p.warmup_base ?? 5,
    warmup_step: p.warmup_step ?? 5,
    warmup_day: p.warmup_day ?? 99, // di default già a regime
    daily_sent: p.daily_sent ?? 0,
    daily_sent_date: p.daily_sent_date ?? TODAY,
  };
}

describe("effectiveDailyCap — ramp di warm-up", () => {
  it("giorno 0 = base", () => {
    expect(effectiveDailyCap(sender({ warmup_day: 0 }))).toBe(5);
  });
  it("ramp lineare prima del target", () => {
    expect(effectiveDailyCap(sender({ warmup_day: 3 }))).toBe(20); // 5 + 3*5
  });
  it("cap al target una volta superato", () => {
    expect(effectiveDailyCap(sender({ warmup_day: 100, daily_cap_target: 40 }))).toBe(40);
  });
});

describe("sentToday — reset implicito a cambio giorno", () => {
  it("stesso giorno → conta", () => {
    expect(sentToday(sender({ daily_sent: 7, daily_sent_date: TODAY }), TODAY)).toBe(7);
  });
  it("giorno diverso → 0", () => {
    expect(sentToday(sender({ daily_sent: 7, daily_sent_date: "2026-06-13" }), TODAY)).toBe(0);
  });
});

describe("remainingToday", () => {
  it("attiva: cap effettivo meno inviati oggi", () => {
    expect(remainingToday(sender({ warmup_day: 100, daily_cap_target: 40, daily_sent: 10 }), TODAY)).toBe(30);
  });
  it("in pausa → 0", () => {
    expect(remainingToday(sender({ status: "paused" }), TODAY)).toBe(0);
  });
  it("disabilitata → 0", () => {
    expect(remainingToday(sender({ status: "disabled" }), TODAY)).toBe(0);
  });
  it("contatore di ieri → capacità piena", () => {
    expect(remainingToday(sender({ warmup_day: 100, daily_cap_target: 40, daily_sent: 40, daily_sent_date: "2026-06-13" }), TODAY)).toBe(40);
  });
});

describe("totalCapacity", () => {
  it("somma solo le caselle eleggibili", () => {
    const senders = [
      sender({ id: "a", warmup_day: 100, daily_cap_target: 40, daily_sent: 10 }), // 30
      sender({ id: "b", status: "paused", daily_cap_target: 40 }),                // 0
      sender({ id: "c", warmup_day: 0 }),                                         // 5
    ];
    expect(totalCapacity(senders, TODAY)).toBe(35);
  });
});

describe("shouldAutoPause", () => {
  it("pausa su troppi bounce", () => { expect(shouldAutoPause(10, 0)).toBe(true); });
  it("pausa su lamentele", () => { expect(shouldAutoPause(0, 2)).toBe(true); });
  it("ok sotto soglia", () => { expect(shouldAutoPause(3, 1)).toBe(false); });
});

describe("assignSenders — round-robin con cap", () => {
  it("distribuisce equamente entro la capacità", () => {
    const senders = [
      sender({ id: "a", warmup_day: 0, daily_cap_target: 40 }), // cap 5
      sender({ id: "b", warmup_day: 0, daily_cap_target: 40 }), // cap 5
    ];
    const { assignments, unassigned } = assignSenders(["m1", "m2", "m3"], senders, TODAY);
    expect(unassigned).toHaveLength(0);
    expect(assignments).toHaveLength(3);
    // round-robin: a, b, a
    expect(assignments.map((x) => x.senderId)).toEqual(["a", "b", "a"]);
  });

  it("lascia in coda ciò che eccede la capacità", () => {
    const senders = [sender({ id: "a", warmup_day: 0, daily_cap_target: 40, daily_sent: 3 })]; // residuo 2
    const { assignments, unassigned } = assignSenders(["m1", "m2", "m3", "m4"], senders, TODAY);
    expect(assignments).toHaveLength(2);
    expect(unassigned).toEqual(["m3", "m4"]);
  });

  it("nessuna casella eleggibile → tutto non assegnato", () => {
    const senders = [sender({ id: "a", status: "paused" })];
    const { assignments, unassigned } = assignSenders(["m1", "m2"], senders, TODAY);
    expect(assignments).toHaveLength(0);
    expect(unassigned).toEqual(["m1", "m2"]);
  });

  it("non supera mai il cap per-casella", () => {
    const senders = [
      sender({ id: "a", warmup_day: 0, daily_cap_target: 40 }), // 5
      sender({ id: "b", warmup_day: 0, daily_cap_target: 40 }), // 5
    ];
    const ids = Array.from({ length: 20 }, (_, i) => `m${i}`);
    const { assignments, unassigned } = assignSenders(ids, senders, TODAY);
    const perSender = assignments.reduce((acc, x) => { acc[x.senderId] = (acc[x.senderId] ?? 0) + 1; return acc; }, {} as Record<string, number>);
    expect(perSender.a).toBe(5);
    expect(perSender.b).toBe(5);
    expect(unassigned).toHaveLength(10);
  });
});
