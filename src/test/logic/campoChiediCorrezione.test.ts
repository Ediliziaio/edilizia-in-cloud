import { describe, expect, it } from "vitest";
import { linkChiediCorrezione } from "@/lib/campo/chiediCorrezione";

describe("Chiedi una correzione del rapportino (collaudo 23/11)", () => {
  it("apre la segnalazione sul cantiere con il testo già iniziato e la data italiana", () => {
    const link = linkChiediCorrezione("o1", "2026-11-22");
    expect(link.startsWith("/campo/ticket/nuovo/o1?testo=")).toBe(true);
    expect(new URLSearchParams(link.split("?")[1]).get("testo")).toBe("Correzione del rapportino del 22/11/2026: ");
  });
});
