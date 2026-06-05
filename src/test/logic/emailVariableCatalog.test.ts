import { describe, it, expect } from "vitest";
import { buildVariableCategories } from "@/components/flow-builder/config-panels/emailVariableCatalog";

describe("buildVariableCategories", () => {
  it("aggrega le variabili del catalogo in categorie leggibili", () => {
    const cats = buildVariableCategories();
    const labels = cats.map((c) => c.label);
    // Categorie attese dalle outputVariables reali dei trigger.
    expect(labels).toContain("Contatto");
    expect(labels).toContain("Azienda");
    expect(labels).toContain("Opportunità");
    // "Nome completo" (full_name) deve esistere nella categoria Contatto.
    const contatto = cats.find((c) => c.id === "contatto");
    expect(contatto?.variables.some((v) => v.key === "contatto.full_name")).toBe(true);
    // Ogni categoria ha variabili, dedupe per chiave.
    for (const c of cats) {
      expect(c.variables.length).toBeGreaterThan(0);
      const keys = c.variables.map((v) => v.key);
      expect(new Set(keys).size).toBe(keys.length); // niente duplicati
    }
  });

  it("fonde i campi extra (es. personalizzati) nella categoria del prefisso", () => {
    const cats = buildVariableCategories([{ key: "contatto.telefono_ufficio", label: "Telefono ufficio" }]);
    const contatto = cats.find((c) => c.id === "contatto");
    expect(contatto).toBeTruthy();
    expect(contatto!.variables.some((v) => v.key === "contatto.telefono_ufficio")).toBe(true);
  });
});
