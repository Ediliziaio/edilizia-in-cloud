import { describe, expect, it } from "vitest";
import { nomeCanaleLeggibile } from "@/lib/chat/nomeCanale";

describe("Nome del canale in chat (collaudo 23/11)", () => {
  it("i canali dei cantieri si leggono col codice commessa", () => {
    expect(nomeCanaleLeggibile("cantiere-ord-2026-001")).toBe("Cantiere ORD-2026-001");
    expect(nomeCanaleLeggibile("cantiere-ord-dem-ris01")).toBe("Cantiere ORD-DEM-RIS01");
  });
  it("gli altri nomi restano come sono", () => {
    expect(nomeCanaleLeggibile("Ufficio tecnico")).toBe("Ufficio tecnico");
    expect(nomeCanaleLeggibile(undefined)).toBe("");
  });
});
