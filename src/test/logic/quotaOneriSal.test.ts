import { describe, expect, it } from "vitest";
import { quotaOneriSal } from "@/lib/subappaltatori/lavoriMisure";

describe("quota oneri della sicurezza nei SAL a misure (stessa regola del database)", () => {
  it("in proporzione ai lavori", () => {
    expect(quotaOneriSal(100, 1000, [], 400)).toBe(40);
  });
  it("l'ultimo SAL prende il residuo", () => {
    expect(quotaOneriSal(100, 1000, [{ stato: "verificato", importo_lordo: 440, oneri_quota: 40 }], 600)).toBe(60);
  });
  it("i SAL contestati non contano", () => {
    expect(quotaOneriSal(100, 1000, [{ stato: "contestato", importo_lordo: 440, oneri_quota: 40 }], 400)).toBe(40);
  });
  it("senza oneri, zero", () => {
    expect(quotaOneriSal(0, 1000, [], 400)).toBe(0);
  });
  it("mai oltre il residuo", () => {
    expect(quotaOneriSal(100, 1000, [{ stato: "pagato", importo_lordo: 1000, oneri_quota: 100 }], 10)).toBe(0);
  });
});
