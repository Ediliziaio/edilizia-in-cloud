import { describe, it, expect } from "vitest";
import { stimaSuperficiVani, calcRigaImporto } from "./calcoli";

describe("ristrutturazione/calcoli", () => {
  describe("stimaSuperficiVani", () => {
    it("100 m², 4 vani, h 2,7 → pareti 216, tinteggiature 316", () => {
      const s = stimaSuperficiVani(100, 2.7, 4);
      expect(s.pavimenti).toBe(100);
      expect(s.soffitti).toBe(100);
      expect(s.pareti).toBe(216); // 4 × √25 × 2,7 × 4
      expect(s.tinteggiature).toBe(316); // pareti + soffitti
    });
    it("n. vani 0 → trattato come 1 vano", () => {
      expect(stimaSuperficiVani(100, 2.7, 0).pareti).toBe(108); // 4 × √100 × 2,7
    });
    it("superficie negativa → tutto 0", () => {
      expect(stimaSuperficiVani(-100, 2.7, 4)).toEqual({ pavimenti: 0, soffitti: 0, pareti: 0, tinteggiature: 0 });
    });
  });

  it("calcRigaImporto: quantità × prezzo × (1 − sconto)", () => {
    expect(calcRigaImporto({ quantita: 2, prezzo_unitario: 100, sconto_pct: 10 })).toBe(180);
  });
});
