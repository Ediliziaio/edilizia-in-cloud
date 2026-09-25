import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { MODULI_VENDITA, deriveModuloStato } from "@/lib/moduli-vendita/config";
import type { ModuloVenditaView } from "@/lib/moduli-vendita/useModuliVendita";
import { filterSalesModules, MODULE_PRESENTATION, parseModuleFilter } from "@/lib/moduli-vendita/presentation";

const makeViews = (): ModuloVenditaView[] => MODULI_VENDITA.map(modulo => ({ modulo, stato: deriveModuloStato(modulo, true), isEnabled: true, isLoading: false, isError: false, errorMessage: null as null, source: "plan" }));

// Il vecchio catalogo separato è stato sostituito dal selettore per aree.
// salesAreas.test.tsx esercita anche l'export di compatibilità ModuliVendutaTab:
// permessi, visibilità, ricerca, URL legacy, caricamenti e percorsi di creazione.
describe("registro e presentazione moduli", () => {
  it("copre tutti i moduli e usa immagini locali esistenti", () => {
    for (const view of makeViews()) {
      const content = MODULE_PRESENTATION[view.modulo.slug];
      expect(content.title).toBeTruthy();
      if (view.stato === "attivo") expect(existsSync("public" + content.image)).toBe(true);
    }
  });
  it("tutte le azioni di creazione puntano a route registrate", () => {
    const routes = readFileSync("src/routes/companyRoutes.tsx", "utf8");
    for (const view of makeViews().filter(v => v.stato === "attivo"))
      expect(routes.includes('path="' + view.modulo.href.replace("/azienda/", "") + '/nuovo"')).toBe(true);
  });
  it("cerca lavorazioni con maiuscole, accenti e più parole", () => {
    expect(filterSalesModules(makeViews(), "  CALDÀIE   idrosanitario ", "tutti").map(v => v.modulo.slug)).toEqual(["termoidraulico"]);
    expect(filterSalesModules(makeViews(), "finestre posa", "attivo").map(v => v.modulo.slug)).toEqual(["serramenti"]);
  });
  it("valida i filtri e non scambia errori di verifica per moduli bloccati", () => {
    expect(parseModuleFilter("non-valido")).toBe("tutti");
    const views = makeViews(); views[0] = { ...views[0], stato: "bloccato", isError: true };
    expect(filterSalesModules(views, "", "bloccato")).toHaveLength(0);
    expect(filterSalesModules(views, "", "tutti")).toHaveLength(12);
  });
});
