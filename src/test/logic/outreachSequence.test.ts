import { describe, it, expect } from "vitest";
import {
  emailSteps,
  firstEmailStep,
  nextEmailStep,
  nonEmailStepCount,
  computeStepSchedule,
  type SeqStep,
} from "../../../supabase/functions/_shared/outreach-sequence";

const steps: SeqStep[] = [
  { step_order: 0, channel: "email", delay_days: 0, delay_hours: 0, subject: "Ciao", body: "1" },
  { step_order: 1, channel: "sms", delay_days: 1, delay_hours: 0, body: "sms" },
  { step_order: 2, channel: "email", delay_days: 3, delay_hours: 0, subject: "Follow", body: "2" },
  { step_order: 3, channel: "email", delay_days: 5, delay_hours: 2, subject: "Ultimo", body: "3" },
];

describe("emailSteps", () => {
  it("filtra solo email e ordina per step_order", () => {
    expect(emailSteps(steps).map((s) => s.step_order)).toEqual([0, 2, 3]);
  });
  it("ordina anche se in input sono disordinati", () => {
    const shuffled = [steps[3], steps[0], steps[2]];
    expect(emailSteps(shuffled).map((s) => s.step_order)).toEqual([0, 2, 3]);
  });
});

describe("firstEmailStep", () => {
  it("ritorna il primo step email", () => {
    expect(firstEmailStep(steps)?.step_order).toBe(0);
  });
  it("salta uno step iniziale non-email", () => {
    const s: SeqStep[] = [
      { step_order: 0, channel: "sms", body: "x" },
      { step_order: 1, channel: "email", subject: "Hey", body: "y" },
    ];
    expect(firstEmailStep(s)?.step_order).toBe(1);
  });
  it("null se nessuno step email", () => {
    expect(firstEmailStep([{ step_order: 0, channel: "sms", body: "x" }])).toBeNull();
  });
  it("null su sequenza vuota", () => {
    expect(firstEmailStep([])).toBeNull();
  });
});

describe("nextEmailStep", () => {
  it("afterOrder null → primo email", () => {
    expect(nextEmailStep(steps, null)?.step_order).toBe(0);
  });
  it("dopo lo step 0 → step 2 (salta l'sms a order 1)", () => {
    expect(nextEmailStep(steps, 0)?.step_order).toBe(2);
  });
  it("dopo lo step 2 → step 3", () => {
    expect(nextEmailStep(steps, 2)?.step_order).toBe(3);
  });
  it("dopo l'ultimo → null (cadenza finita)", () => {
    expect(nextEmailStep(steps, 3)).toBeNull();
  });
  it("afterOrder oltre la fine → null", () => {
    expect(nextEmailStep(steps, 99)).toBeNull();
  });
});

describe("nonEmailStepCount", () => {
  it("conta gli step non-email", () => {
    expect(nonEmailStepCount(steps)).toBe(1);
  });
  it("zero se tutti email", () => {
    expect(nonEmailStepCount([{ step_order: 0, channel: "email", body: "x" }])).toBe(0);
  });
});

describe("computeStepSchedule", () => {
  const base = new Date("2026-06-15T09:00:00.000Z");
  it("aggiunge giorni e ore", () => {
    expect(computeStepSchedule(base, 3, 2).toISOString()).toBe("2026-06-18T11:00:00.000Z");
  });
  it("delay 0 → stessa data", () => {
    expect(computeStepSchedule(base, 0, 0).toISOString()).toBe(base.toISOString());
  });
  it("null/undefined trattati come 0", () => {
    expect(computeStepSchedule(base, null, null).toISOString()).toBe(base.toISOString());
    expect(computeStepSchedule(base).toISOString()).toBe(base.toISOString());
  });
  it("valori negativi clampati a 0", () => {
    expect(computeStepSchedule(base, -5, -3).toISOString()).toBe(base.toISOString());
  });
  it("tronca i frazionari", () => {
    expect(computeStepSchedule(base, 1.9, 0).toISOString()).toBe("2026-06-16T09:00:00.000Z");
  });
});
