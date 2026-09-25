import { describe, expect, it } from "vitest";
import {
  buildStandardTextTemplate,
  type StandardTemplateModule,
} from "@/lib/preventivi/standardTextTemplates";
import { standardTemplateAreaStatus } from "@/lib/preventivi/standardTemplateAreas";

const modules: StandardTemplateModule[] = [
  "serramenti",
  "fotovoltaico",
  "ristrutturazione",
  "bagni",
  "tetti",
  "climatizzazione",
  "elettrico",
  "termoidraulico",
  "pavimenti",
  "piscine",
];

describe("libreria testi standard dei preventivi", () => {
  it("copre tutti i moduli e tutte le aree testuali comuni", () => {
    for (const module of modules) {
      const draft = buildStandardTextTemplate(module, "tecnica");
      expect(draft.cover_title).toBeTruthy();
      expect(draft.cover_subtitle).toBeTruthy();
      expect(draft.chi_siamo).toContain("<p>");
      expect(draft.esigenze).toHaveLength(4);
      expect(draft.soluzione).toHaveLength(4);
      expect(draft.usp).toHaveLength(4);
      expect(draft.garanzie).toHaveLength(4);
      expect(draft.percorso).toHaveLength(5);
      expect(draft.cronoprogramma).toHaveLength(4);
      expect(draft.faq).toHaveLength(5);
      expect(draft.payment_terms_text).toBeTruthy();
      expect(draft.validity_text).toBeTruthy();
      expect(draft.footer_text).toBeTruthy();
    }
  });

  it("offre quattro impostazioni di tono senza lasciare campi vuoti", () => {
    const styles = ["chiara", "premium", "tecnica", "essenziale"] as const;
    for (const style of styles) {
      const draft = buildStandardTextTemplate("fotovoltaico", style);
      expect(draft.cover_title).toBeTruthy();
      expect(draft.faq?.length).toBeGreaterThanOrEqual(4);
      expect(draft.cronoprogramma?.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("segnala le aree mancanti senza confondere testi commerciali e legali", () => {
    const draft = buildStandardTextTemplate("bagni", "chiara");
    const areas = standardTemplateAreaStatus(draft as unknown as Record<string, unknown>);
    expect(areas.find((area) => area.id === "cover")?.ready).toBe(true);
    expect(areas.find((area) => area.id === "company")?.ready).toBe(true);
    expect(areas.find((area) => area.id === "economics")?.ready).toBe(true);
    expect(areas.find((area) => area.id === "legal")?.ready).toBe(false);
    expect(areas.find((area) => area.id === "pages")?.ready).toBe(false);
  });
});
