import { describe, it, expect } from "vitest";
import { applyJitter } from "../../../supabase/functions/_shared/outreach-sequence";
describe("applyJitter", () => {
  const base = new Date("2026-06-15T09:00:00Z");
  it("rand=0 → invariato", () => { expect(applyJitter(base, 90, 0).getTime()).toBe(base.getTime()); });
  it("rand≈1 → vicino al max", () => { expect(applyJitter(base, 90, 0.999).getTime()).toBe(base.getTime() + 89*60000); });
  it("entro i limiti", () => { const d = applyJitter(base, 90, 0.5); expect(d.getTime()).toBeGreaterThanOrEqual(base.getTime()); expect(d.getTime()).toBeLessThanOrEqual(base.getTime()+90*60000); });
});
