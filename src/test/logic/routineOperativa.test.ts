import { describe, expect, it } from "vitest";
import { oraItalianaParti, routineDovutaOra } from "../../../supabase/functions/_shared/routineOperativa";

// 2026-09-28 è lunedì. 05:00Z = 07:00 in Italia (ora legale).
const LUN_0700 = new Date("2026-09-28T05:00:00Z");
const LUN_0720 = new Date("2026-09-28T05:20:00Z");

describe("ora italiana", () => {
  it("lunedì alle 07:00", () => {
    expect(oraItalianaParti(LUN_0700)).toEqual({ giorno: 1, minuti: 7 * 60 });
  });
});

describe("automazione dovuta adesso", () => {
  it("parte nel suo giorno e nella finestra dei 15 minuti", () => {
    expect(routineDovutaOra({ ora: "07:00", giorni: [1, 2, 3, 4, 5] }, LUN_0700)).toBe(true);
  });
  it("non parte fuori dalla finestra", () => {
    expect(routineDovutaOra({ ora: "07:00", giorni: [1] }, LUN_0720)).toBe(false);
  });
  it("non parte in un giorno diverso", () => {
    expect(routineDovutaOra({ ora: "07:00", giorni: [2] }, LUN_0700)).toBe(false);
  });
  it("senza ora non parte; con force parte sempre", () => {
    expect(routineDovutaOra({ ora: null, giorni: [1] }, LUN_0700)).toBe(false);
    expect(routineDovutaOra({ ora: null, giorni: [] }, LUN_0720, true)).toBe(true);
  });
});
