// src/test/logic/chiSpunta.test.ts
import { describe, expect, it } from "vitest";
import { CHI_SPUNTA, chiSpuntaValido } from "@/lib/orders/chiSpunta";

describe("chiSpunta", () => {
  it("le tre scelte, con «chiunque» per prima (il comportamento di oggi)", () => {
    expect(CHI_SPUNTA.map((s) => s.valore)).toEqual(["tutti", "chi_la_fa", "capi"]);
  });
  it("un valore sconosciuto, o assente, vale «tutti»", () => {
    expect(chiSpuntaValido("capi")).toBe("capi");
    expect(chiSpuntaValido("chi_la_fa")).toBe("chi_la_fa");
    expect(chiSpuntaValido("a caso")).toBe("tutti");
    expect(chiSpuntaValido(null)).toBe("tutti");
    expect(chiSpuntaValido(undefined)).toBe("tutti");
  });
});
