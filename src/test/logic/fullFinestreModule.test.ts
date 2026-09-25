import { describe, expect, it } from "vitest";
import { createFullSerramentiTemplate, upgradeSerramentiModuleTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { createSerramentiModuleTemplate } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { leggiBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { serramentiCopyChoices } from "@/lib/moduli-vendita/serramentiInterventionCopy";

const base = { company_id: "qa", chi_siamo_testo: "La presentazione approvata dell'impresa" };
describe("Finestre: edizione completa sul motore originale", () => {
  it("ha contenuti specifici e tutte le sezioni, senza prove o condizioni inventate", () => {
    const t = createFullSerramentiTemplate(base, "finestre");
    expect(t.chi_siamo_testo).toBe(base.chi_siamo_testo);
    expect(t.esigenze_default).toHaveLength(3);
    expect(t.soluzione_default).toHaveLength(3);
    expect(t.percorso_cliente?.fasi).toHaveLength(4);
    expect(t.garanzie).toHaveLength(4);
    expect(t.faq_items).toHaveLength(8);
    expect(t.testimonianze_default).toEqual([]);
    expect(t.condizioni_legali_attivo).toBe(false);
    expect(t.pdf_mostra_recupero_fiscale).toBe(false);
    for (const key of ["comeFunziona", "protezione", "controlli", "documenti", "diario"]) {
      expect(t.pdf_blocchi?.[key]).toBeDefined();
    }
  });
  it("ripristina il contenuto del modulo e non la copia generica", () => {
    const t = createFullSerramentiTemplate(base, "finestre");
    const blocks = { ...t.pdf_blocchi }; delete blocks.comeFunziona;
    expect(leggiBlocco("comeFunziona", "serramenti", blocks).titolo).toContain("sistema");
  });
  it("aggiorna conservando modifiche, comprese liste personalizzate", () => {
    const old = { ...createSerramentiModuleTemplate(base, "finestre"), pdf_cover_hero: "La mia offerta", esigenze_default: [{ titolo: "Mia esigenza", descrizione: "Da conservare" }] };
    const next = upgradeSerramentiModuleTemplate(old, base, "finestre");
    expect(next.pdf_cover_hero).toBe(old.pdf_cover_hero);
    expect(next.esigenze_default).toEqual(old.esigenze_default);
    expect(next.percorso_cliente?.attivo).toBe(true);
  });
  it("offre dieci varianti testuali applicabili a un solo campo", () => {
    const choices = serramentiCopyChoices("finestre", createFullSerramentiTemplate(base, "finestre"));
    expect(choices).toHaveLength(10);
    for (const c of choices) expect(Object.keys(c.patch)).toHaveLength(1);
  });
});
