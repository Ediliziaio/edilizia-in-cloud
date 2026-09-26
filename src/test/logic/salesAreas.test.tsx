/**
 * La tassonomia dei moduli di vendita: aree e interventi (src/lib/moduli-vendita/areas.ts).
 *
 * Il 25/09/2026 sono state tolte la vecchia scheda «Moduli» (SalesAreasTab,
 * ModuliVendutaTab, AreaWorkspace) e il dialogo di attivazione, che nessuna
 * pagina mostrava più: si crea dalla finestra «Nuovo preventivo», provata in
 * newQuoteDialog.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { SALES_AREAS, findSalesArea, matchesSalesArea } from "@/lib/moduli-vendita/areas";
import { MODULI_VENDITA } from "@/lib/moduli-vendita/config";

describe("tassonomia area → intervento", () => {
  it("definisce 12 aree e 77 interventi senza identificatori duplicati", () => {
    expect(SALES_AREAS).toHaveLength(12);
    expect(new Set(SALES_AREAS.map(area => area.id)).size).toBe(12);
    expect(SALES_AREAS.flatMap(area => area.interventions)).toHaveLength(77);
    for (const area of SALES_AREAS) {
      expect(MODULI_VENDITA.some(module => module.slug === area.sourceModule)).toBe(true);
      expect(new Set(area.interventions.map(item => item.id)).size).toBe(area.interventions.length);
      for (const item of area.interventions) { expect(item.fields).toHaveLength(4); expect(item.status).toBe("planned"); }
    }
  });
  it("raggruppa cappotto e pompe di calore senza cambiare gli entitlement", () => {
    expect(findSalesArea("cappotto")?.id).toBe("facciate");
    expect(findSalesArea("pompe_calore")?.id).toBe("termoidraulica");
    expect(findSalesArea("pompe_calore")?.sourceModule).toBe("termoidraulico");
    expect(findSalesArea("termoidraulica")?.interventions.some(item => item.id === "pompa-calore")).toBe(true);
    expect(findSalesArea("inventato")).toBeUndefined();
  });
  it("cerca nei moduli, non soltanto nel titolo dell'area", () => {
    expect(SALES_AREAS.filter(area => matchesSalesArea(area, "PERSIÀNE" )).map(area => area.id)).toEqual(["serramenti"]);
    expect(SALES_AREAS.filter(area => matchesSalesArea(area, "ripasso tetto")).map(area => area.id)).toEqual(["tetti"]);
  });
});
