import { describe, expect, it } from "vitest";
import { createFullSerramentiTemplate, upgradeSerramentiModuleTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { createSerramentiModuleTemplate } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { serramentiCopyChoices } from "@/lib/moduli-vendita/serramentiInterventionCopy";
import { leggiBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { leggiTestata } from "../../../supabase/functions/_shared/testatePagine";
const base = { company_id: "qa", ragione_sociale: "Impresa esempio" };
describe("Zanzariere: documento originale completo", () => {
  it("comprende pagine specifiche, percorso, garanzie e FAQ senza promesse del vetro", () => {
    const t = createFullSerramentiTemplate(base, "zanzariere");
    expect(t.esigenze_default).toHaveLength(3);
    expect(t.soluzione_default).toHaveLength(3);
    expect(t.percorso_cliente?.fasi).toHaveLength(4);
    expect(t.garanzie).toHaveLength(4);
    expect(t.faq_items).toHaveLength(8);
    expect(t.pdf_pages_order?.filter(p => p.visible).map(p => p.id)).toEqual(expect.arrayContaining(["come_funziona", "protezione", "controlli", "documenti", "diario", "allegato_tecnico"]));
    expect(JSON.stringify(t.pdf_blocchi)).not.toMatch(/warm edge|vetrocamera|trasmittanza/);
    expect(t.testimonianze_default).toEqual([]);
    expect(t.condizioni_legali_attivo).toBe(false);
    expect(t.pdf_mostra_recupero_fiscale).toBe(false);
  });
  it("ripristina anche titolo e blocchi specifici della zanzariera", () => {
    const t = createFullSerramentiTemplate(base, "zanzariere");
    const b = { ...t.pdf_blocchi };
    delete b.comeFunziona; delete b.testata_domande;
    expect(leggiBlocco("comeFunziona", "serramenti", b).titolo).toContain("zanzariera");
    expect(leggiTestata("domande", "serramenti", b).titolo).toContain("zanzariere");
  });
  it("aggiorna la vecchia bozza senza sovrascrivere foto e testi personalizzati", () => {
    const old = { ...createSerramentiModuleTemplate(base, "zanzariere"), pdf_cover_image_url: "/foto-mia.jpg", pdf_cover_hero: "Titolo mio" };
    const next = upgradeSerramentiModuleTemplate(old, base, "zanzariere");
    expect(next.pdf_cover_image_url).toBe("/foto-mia.jpg");
    expect(next.pdf_cover_hero).toBe("Titolo mio");
    expect(next.percorso_cliente?.attivo).toBe(true);
  });
  it("ha dieci varianti per singolo campo, senza modificare le foto o condizioni", () => {
    const choices = serramentiCopyChoices("zanzariere", createFullSerramentiTemplate(base, "zanzariere"));
    expect(choices).toHaveLength(10);
    for (const c of choices) expect(Object.keys(c.patch)).toHaveLength(1);
    expect(new Set(choices.map(c => c.id)).size).toBe(10);
  });
});
