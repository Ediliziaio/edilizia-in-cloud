import { describe, it, expect } from "vitest";
import { applyWinnerToSubject } from "../../../supabase/functions/_shared/outreach-abz";
describe("applyWinnerToSubject", () => {
  it("collassa alla variante vincente", () => { expect(applyWinnerToSubject("A===B===C", 1)).toBe("B"); });
  it("indice fuori range → invariato", () => { expect(applyWinnerToSubject("A===B", 9)).toBe("A===B"); });
  it("nessuna variante multipla → invariato", () => { expect(applyWinnerToSubject("Solo uno", 0)).toBe("Solo uno"); });
});
