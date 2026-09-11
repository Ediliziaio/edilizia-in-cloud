import { describe, it, expect } from "vitest";
import {
  effectiveDailyCap, sentToday, remainingToday, totalCapacity, shouldAutoPause, assignSenders,
  steadyCap, poolCapacityStats, dailyCapWithVariance, unaAssegnazionePerCasella,
  type SenderState, type Assignment,
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

  it("rotazione deterministica per id, indipendente dall'ordine d'ingresso", () => {
    const a = sender({ id: "aaa", warmup_day: 100, daily_cap_target: 40 });
    const b = sender({ id: "bbb", warmup_day: 100, daily_cap_target: 40 });
    const c = sender({ id: "ccc", warmup_day: 100, daily_cap_target: 40 });
    const ids = ["m1", "m2", "m3"];
    const r1 = assignSenders(ids, [c, a, b], TODAY);
    const r2 = assignSenders(ids, [b, c, a], TODAY);
    // qualunque sia l'ordine di riga del DB, l'assegnazione è la stessa (ordine per id)
    expect(r1.assignments.map((x) => x.senderId)).toEqual(["aaa", "bbb", "ccc"]);
    expect(r2.assignments.map((x) => x.senderId)).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("spalma 1000 invii su 100 caselle senza sforare alcun cap", () => {
    // 100 caselle a regime, cap 40 → capacità 4000/giorno; 1000 in coda si distribuiscono
    // ~10 a casella, nessuna oltre il proprio cap, nessun residuo non assegnato.
    const senders = Array.from({ length: 100 }, (_, i) =>
      sender({ id: `s${String(i).padStart(3, "0")}`, warmup_day: 100, daily_cap_target: 40 }),
    );
    const ids = Array.from({ length: 1000 }, (_, i) => `m${i}`);
    const { assignments, unassigned } = assignSenders(ids, senders, TODAY);
    expect(assignments).toHaveLength(1000);
    expect(unassigned).toHaveLength(0);
    const perSender = assignments.reduce((acc, x) => { acc[x.senderId] = (acc[x.senderId] ?? 0) + 1; return acc; }, {} as Record<string, number>);
    const counts = Object.values(perSender);
    expect(Math.max(...counts)).toBeLessThanOrEqual(40); // mai oltre il cap
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1); // equa
  });
});

describe("unaAssegnazionePerCasella — mai 2 invii dalla stessa casella nello stesso tick", () => {
  const a = (queueId: string, senderId: string): Assignment => ({ queueId, senderId });

  it("tiene tutte le assegnazioni se ogni casella compare una sola volta", () => {
    const { kept, deferred } = unaAssegnazionePerCasella([a("m1", "x"), a("m2", "y"), a("m3", "z")]);
    expect(kept).toEqual([a("m1", "x"), a("m2", "y"), a("m3", "z")]);
    expect(deferred).toBe(0);
  });

  it("tiene solo la prima occorrenza per casella, rinvia le altre", () => {
    const { kept, deferred } = unaAssegnazionePerCasella([a("m1", "x"), a("m2", "x"), a("m3", "x")]);
    expect(kept).toEqual([a("m1", "x")]);
    expect(deferred).toBe(2);
  });

  it("l'ordine d'ingresso decide chi vince a parità di casella (es. sticky prima di un primo contatto)", () => {
    const { kept } = unaAssegnazionePerCasella([a("sticky-followup", "x"), a("nuovo-contatto", "x")]);
    expect(kept).toEqual([a("sticky-followup", "x")]);
  });

  it("caselle diverse restano tutte, solo i duplicati sulla stessa casella vengono rinviati", () => {
    const input = [a("m1", "a"), a("m2", "b"), a("m3", "a"), a("m4", "c"), a("m5", "b")];
    const { kept, deferred } = unaAssegnazionePerCasella(input);
    expect(kept.map((x) => x.queueId)).toEqual(["m1", "m2", "m4"]);
    expect(deferred).toBe(2);
  });

  it("lista vuota → nessuna assegnazione, nessun rinvio", () => {
    expect(unaAssegnazionePerCasella([])).toEqual({ kept: [], deferred: 0 });
  });
});

describe("dailyCapWithVariance — cap giornaliero umano (varianza deterministica)", () => {
  it("MAI sopra il cap effettivo (= ≤ daily_cap_target a regime)", () => {
    // 100 caselle × 30 giorni: nessun valore deve mai superare il cap effettivo.
    for (let i = 0; i < 100; i++) {
      const s = sender({ id: `s${i}`, warmup_day: 100, daily_cap_target: 40 });
      const eff = effectiveDailyCap(s); // 40
      for (let d = 1; d <= 30; d++) {
        const v = dailyCapWithVariance(s, `2026-06-${String(d).padStart(2, "0")}`);
        expect(v).toBeLessThanOrEqual(eff);
        expect(v).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("varianza solo verso il basso entro maxReductionPct (15%)", () => {
    const s = sender({ id: "x", warmup_day: 100, daily_cap_target: 100 }); // eff 100
    for (let d = 1; d <= 31; d++) {
      const v = dailyCapWithVariance(s, `2026-07-${String(d).padStart(2, "0")}`);
      expect(v).toBeLessThanOrEqual(100);
      expect(v).toBeGreaterThanOrEqual(85); // 100 - 15%
    }
  });

  it("deterministico: stesso (casella, giorno) → stesso valore (idempotente tra i tick)", () => {
    const s = sender({ id: "stable", warmup_day: 100, daily_cap_target: 50 });
    expect(dailyCapWithVariance(s, "2026-06-20")).toBe(dailyCapWithVariance(s, "2026-06-20"));
  });

  it("varia tra giorni diversi (non è sempre lo stesso numero tondo)", () => {
    const s = sender({ id: "vary", warmup_day: 100, daily_cap_target: 80 });
    const vals = new Set<number>();
    for (let d = 1; d <= 28; d++) vals.add(dailyCapWithVariance(s, `2026-06-${String(d).padStart(2, "0")}`));
    // su 28 giorni almeno qualche valore diverso (varianza reale, non costante)
    expect(vals.size).toBeGreaterThan(1);
  });

  it("varia tra caselle diverse nello stesso giorno", () => {
    const day = "2026-06-15";
    const vals = new Set<number>();
    for (let i = 0; i < 30; i++) vals.add(dailyCapWithVariance(sender({ id: `mb${i}`, warmup_day: 100, daily_cap_target: 80 }), day));
    expect(vals.size).toBeGreaterThan(1);
  });

  it("volumi bassi (cap ≤ floor=5, warm-up iniziale) → nessuna riduzione", () => {
    const s = sender({ id: "warm", warmup_day: 0 }); // eff = warmup_base = 5
    expect(effectiveDailyCap(s)).toBe(5);
    expect(dailyCapWithVariance(s, "2026-06-15")).toBe(5);
  });

  it("casella non eleggibile (cap effettivo 0) → 0", () => {
    const s = sender({ id: "z", warmup_base: 0, warmup_step: 0, warmup_day: 0, daily_cap_target: 0 });
    expect(dailyCapWithVariance(s, "2026-06-15")).toBe(0);
  });
});

describe("remainingToday / assignSenders — varianceKey opzionale (retro-compatibile)", () => {
  it("senza varianceKey: comportamento legacy (cap effettivo pieno)", () => {
    const s = sender({ warmup_day: 100, daily_cap_target: 40, daily_sent: 10 });
    expect(remainingToday(s, TODAY)).toBe(30); // identico a prima
  });

  it("con varianceKey: residuo = capVarianza − inviati, sempre ≤ legacy", () => {
    const s = sender({ id: "rv", warmup_day: 100, daily_cap_target: 40, daily_sent: 10 });
    const withVar = remainingToday(s, TODAY, TODAY);
    expect(withVar).toBeLessThanOrEqual(30);
    expect(withVar).toBeGreaterThanOrEqual(0);
  });

  it("assignSenders con varianceKey non sfora mai il cap-varianza per casella", () => {
    const senders = Array.from({ length: 10 }, (_, i) =>
      sender({ id: `s${String(i).padStart(2, "0")}`, warmup_day: 100, daily_cap_target: 40 }),
    );
    const ids = Array.from({ length: 1000 }, (_, i) => `m${i}`);
    const { assignments } = assignSenders(ids, senders, TODAY, TODAY);
    const perSender = assignments.reduce((acc, x) => { acc[x.senderId] = (acc[x.senderId] ?? 0) + 1; return acc; }, {} as Record<string, number>);
    for (const s of senders) {
      const cap = dailyCapWithVariance(s, TODAY);
      expect(perSender[s.id] ?? 0).toBeLessThanOrEqual(cap);
    }
  });
});

describe("steadyCap — cap a regime", () => {
  it("attiva → target", () => { expect(steadyCap(sender({ daily_cap_target: 50 }))).toBe(50); });
  it("in pausa → 0", () => { expect(steadyCap(sender({ status: "paused", daily_cap_target: 50 }))).toBe(0); });
});

describe("poolCapacityStats — riepilogo capacità pool a scala", () => {
  it("pool vuoto: nessuna casella, servono target/fallback caselle", () => {
    const r = poolCapacityStats([], TODAY, 1000, 40);
    expect(r.eligible).toBe(0);
    expect(r.effectiveToday).toBe(0);
    expect(r.steady).toBe(0);
    expect(r.mailboxesNeededForTarget).toBe(25); // ceil(1000/40)
    expect(r.mailboxesToAdd).toBe(25);
  });

  it("somma capacità effettiva e a regime solo delle eleggibili", () => {
    const senders = [
      sender({ id: "a", warmup_day: 100, daily_cap_target: 40, daily_sent: 10 }), // eff 30, steady 40
      sender({ id: "b", warmup_day: 0, daily_cap_target: 40 }),                   // eff 5,  steady 40, warming
      sender({ id: "c", status: "paused", daily_cap_target: 40 }),               // escluso
    ];
    const r = poolCapacityStats(senders, TODAY, 1000, 40);
    expect(r.eligible).toBe(2);
    expect(r.effectiveToday).toBe(35);
    expect(r.steady).toBe(80);
    expect(r.warming).toBe(1);
  });

  it("capacità a regime già sufficiente → needed = -1, nulla da aggiungere", () => {
    const senders = Array.from({ length: 30 }, (_, i) =>
      sender({ id: `s${i}`, warmup_day: 100, daily_cap_target: 40 }),
    ); // steady 1200 ≥ 1000
    const r = poolCapacityStats(senders, TODAY, 1000, 40);
    expect(r.steady).toBe(1200);
    expect(r.mailboxesNeededForTarget).toBe(-1);
    expect(r.mailboxesToAdd).toBe(0);
  });

  it("stima caselle da aggiungere sul cap medio reale del pool", () => {
    // 10 caselle, cap medio 50 → per 1000/g servono ceil(1000/50)=20, da aggiungere 10
    const senders = Array.from({ length: 10 }, (_, i) =>
      sender({ id: `s${i}`, warmup_day: 0, daily_cap_target: 50 }),
    );
    const r = poolCapacityStats(senders, TODAY, 1000, 40);
    expect(r.mailboxesNeededForTarget).toBe(20);
    expect(r.mailboxesToAdd).toBe(10);
  });

  it("target 0 → nessuna casella necessaria", () => {
    const r = poolCapacityStats([sender()], TODAY, 0, 40);
    expect(r.mailboxesNeededForTarget).toBe(0);
    expect(r.mailboxesToAdd).toBe(0);
  });
});
