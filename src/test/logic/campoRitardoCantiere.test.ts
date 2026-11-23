import { describe, expect, it } from "vitest";
import { giorniRitardoCantiere, testoRitardoCantiere } from "@/lib/campo/ritardoCantiere";

describe("Ritardo del cantiere (collaudo 23/11)", () => {
  it("fine passata e commessa aperta: giorni di ritardo", () => {
    expect(giorniRitardoCantiere("2026-08-16", "2026-11-23", "confermato")).toBe(99);
    expect(giorniRitardoCantiere("2026-11-22T00:00:00Z", "2026-11-23", "in_corso")).toBe(1);
  });
  it("niente ritardo: fine oggi o futura, senza fine, commessa chiusa", () => {
    expect(giorniRitardoCantiere("2026-11-23", "2026-11-23", "confermato")).toBeNull();
    expect(giorniRitardoCantiere(null, "2026-11-23", "confermato")).toBeNull();
    expect(giorniRitardoCantiere("2026-08-16", "2026-11-23", "completato")).toBeNull();
  });
  it("singolare e plurale", () => {
    expect(testoRitardoCantiere(1)).toBe("in ritardo di 1 giorno");
    expect(testoRitardoCantiere(99)).toBe("in ritardo di 99 giorni");
  });
});
