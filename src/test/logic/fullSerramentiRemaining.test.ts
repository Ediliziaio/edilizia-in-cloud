import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { createFullSerramentiTemplate, FULL_SERRAMENTI_MODULES, upgradeSerramentiModuleTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { createSerramentiModuleTemplate } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { fotoDellaLibreria, leggiBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { serramentiCopyChoices } from "@/lib/moduli-vendita/serramentiInterventionCopy";
describe.each(["porte-interne", "combinato"] as const)("Edizione completa %s", id => {
  it("ha tutti i contenuti e una libreria immagini esistente, senza prove sociali inventate", () => {
    const t = createFullSerramentiTemplate({ company_id: "qa" }, id);
    expect(FULL_SERRAMENTI_MODULES).toContain(id);
    expect(t.esigenze_default).toHaveLength(3);
    expect(t.soluzione_default).toHaveLength(3);
    expect(t.percorso_cliente?.fasi).toHaveLength(4);
    expect(t.garanzie).toHaveLength(4);
    expect(t.faq_items).toHaveLength(8);
    expect(t.testimonianze_default).toEqual([]);
    expect(t.gallery_lavori).toEqual([]);
    expect(t.condizioni_legali_attivo).toBe(false);
    const images = fotoDellaLibreria("serramenti", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(2);
    expect(new Set(images.map(i => i.url)).size).toBe(images.length);
    for (const i of images) { expect(existsSync(`public${i.url}`)).toBe(true); expect(i.nome).toContain("illustrativ"); }
    expect(leggiBlocco("comeFunziona", "serramenti", t.pdf_blocchi).foto.length).toBeGreaterThan(0);
  });
  it("ripristina foto e testi specifici e mantiene le personalizzazioni all'aggiornamento", () => {
    const old = { ...createSerramentiModuleTemplate({}, id), pdf_cover_hero: "Titolo personalizzato", pdf_blocchi: { modulo_esclusioni: "Esclusioni mie", controlli: { titolo: "Controlli miei" } } };
    const next = upgradeSerramentiModuleTemplate(old, {}, id);
    expect(next.pdf_cover_hero).toBe("Titolo personalizzato");
    expect(next.pdf_blocchi?.modulo_esclusioni).toBe("Esclusioni mie");
    expect(next.pdf_blocchi?.controlli).toEqual({ titolo: "Controlli miei" });
    const b = { ...next.pdf_blocchi }; delete b.comeFunziona;
    expect(leggiBlocco("comeFunziona", "serramenti", b).foto.length).toBeGreaterThan(0);
  });
  it("offre dieci varianti a campo singolo", () => {
    const choices = serramentiCopyChoices(id, createFullSerramentiTemplate({}, id));
    expect(choices).toHaveLength(10);
    for (const choice of choices) expect(Object.keys(choice.patch)).toHaveLength(1);
  });
});
