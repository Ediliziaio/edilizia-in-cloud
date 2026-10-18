import { describe, expect, it } from "vitest";
import { NOTE_DI_CREDITO, eNotaDiCredito } from "@/lib/fatturazione/noteDiCredito";

describe("note di credito: un solo elenco", () => {
  it("riconosce TD04, TD08 e le note importate", () => {
    expect([...NOTE_DI_CREDITO].sort()).toEqual(["TD04", "TD08", "passive_credit_note"]);
    for (const tipo of ["TD04", "TD08", "passive_credit_note", " TD08 "]) expect(eNotaDiCredito(tipo)).toBe(true);
  });
  it("fatture, parcelle e valori vuoti non sono note di credito", () => {
    for (const tipo of ["TD01", "TD06", "TD24", "td04", "", null, undefined]) expect(eNotaDiCredito(tipo)).toBe(false);
  });
});
