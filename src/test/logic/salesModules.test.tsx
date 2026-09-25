import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MODULI_VENDITA, deriveModuloStato } from "@/lib/moduli-vendita/config";
import type { ModuloVenditaView } from "@/lib/moduli-vendita/useModuliVendita";

const makeViews = (): ModuloVenditaView[] => MODULI_VENDITA.map(modulo => ({ modulo, stato: deriveModuloStato(modulo, true), isEnabled: true, isLoading: false, isError: false, errorMessage: null as null, source: "plan" }));

// Il vecchio catalogo e la scheda per aree non ci sono più (25/09/2026): si crea
// dalla finestra «Nuovo preventivo» (newQuoteDialog.test.tsx).
describe("registro e presentazione moduli", () => {
  it("tutte le azioni di creazione puntano a route registrate", () => {
    const routes = readFileSync("src/routes/companyRoutes.tsx", "utf8");
    for (const view of makeViews().filter(v => v.stato === "attivo"))
      expect(routes.includes('path="' + view.modulo.href.replace("/azienda/", "") + '/nuovo"')).toBe(true);
  });
});
