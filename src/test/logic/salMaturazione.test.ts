// src/test/logic/salMaturazione.test.ts
import { describe, expect, it } from "vitest";
import { SAL_MATURA, salMaturaValido, salMaturato } from "@/lib/orders/salMaturazione";

describe("quando matura la rata di un SAL", () => {
  it("«emesso»: ogni stato tranne la bozza", () => {
    for (const stato of ["emesso", "approvato", "firmato"]) expect(salMaturato("emesso", stato), stato).toBe(true);
    expect(salMaturato("emesso", "bozza")).toBe(false);
  });
  it("«approvato»: solo approvato o firmato", () => {
    expect(salMaturato("approvato", "approvato")).toBe(true);
    expect(salMaturato("approvato", "firmato")).toBe(true);
    expect(salMaturato("approvato", "emesso")).toBe(false);
    expect(salMaturato("approvato", "bozza")).toBe(false);
  });
  it("un valore che non si riconosce vale «emesso»", () => {
    expect(salMaturaValido("approvato")).toBe("approvato");
    expect(salMaturaValido("emesso")).toBe("emesso");
    for (const v of [undefined, null, "boh", 3]) expect(salMaturaValido(v)).toBe("emesso");
  });
  it("le due scelte hanno parole semplici", () => {
    expect(SAL_MATURA.map((s) => s.valore)).toEqual(["emesso", "approvato"]);
    for (const s of SAL_MATURA) expect(s.spiegazione.length).toBeGreaterThan(20);
  });
});
