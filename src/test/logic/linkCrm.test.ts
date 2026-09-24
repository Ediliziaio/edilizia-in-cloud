/**
 * Da un appuntamento o da un'attività si apre il contatto o l'opportunità
 * collegata (24/09/2026). Prima l'opportunità di un'attività portava
 * all'elenco generale e dall'appuntamento non si apriva niente.
 */
import { describe, expect, it } from "vitest";
import { linkContatto, linkOpportunita } from "@/lib/marketing/linkCrm";
import sorgentePaginaOpportunita from "@/pages/azienda/marketing/MarketingOpportunities.tsx?raw";

describe("linkContatto", () => {
  it("la scheda del contatto, nell'area azienda o admin", () => {
    expect(linkContatto("/azienda/marketing", "c-1")).toBe("/azienda/marketing/contatti/c-1");
    expect(linkContatto("/admin/marketing", "c-1")).toBe("/admin/marketing/contatti/c-1");
  });
});

describe("linkOpportunita", () => {
  it("la pagina Opportunità con l'opportunità da aprire", () => {
    expect(linkOpportunita("/azienda/marketing", "o-1")).toBe("/azienda/marketing/opportunita?apri=o-1");
  });

  it("usa lo stesso parametro che la pagina Opportunità legge", () => {
    expect(sorgentePaginaOpportunita).toContain('searchParamsRaw.get("apri")');
  });
});
