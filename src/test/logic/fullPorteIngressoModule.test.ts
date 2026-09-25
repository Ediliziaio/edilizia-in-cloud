import { describe, expect, it } from "vitest";
import { createFullSerramentiTemplate, FULL_SERRAMENTI_MODULES, upgradeSerramentiModuleTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { createSerramentiModuleTemplate, serramentiModuleDemoSize } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { leggiBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { serramentiCopyChoices } from "@/lib/moduli-vendita/serramentiInterventionCopy";
describe("Porte d'ingresso: documento originale dedicato", () => {
  it("non usa le misure dimostrative di una finestra per la porta", () => {
    expect(serramentiModuleDemoSize("porte-ingresso")).toEqual({ larghezza_mm: 900, altezza_mm: 2100, metri_quadri: 1.89 });
    expect(serramentiModuleDemoSize("porte-interne").altezza_mm).toBe(2100);
    expect(serramentiModuleDemoSize("finestre").altezza_mm).toBe(1400);
  });
  it("include pagine e testi specifici senza attribuire classi o prove inesistenti", () => {
    const t = createFullSerramentiTemplate({}, "porte-ingresso");
    expect(FULL_SERRAMENTI_MODULES).toContain("porte-ingresso");
    expect(t.pdf_cover_image_url).toContain("porte-ingresso");
    expect(t.esigenze_default).toHaveLength(3);
    expect(t.soluzione_default).toHaveLength(3);
    expect(t.percorso_cliente?.fasi).toHaveLength(4);
    expect(t.faq_items).toHaveLength(8);
    expect(t.garanzie).toHaveLength(4);
    expect(t.testimonianze_default).toEqual([]);
    expect(t.certificazioni).toEqual([]);
    expect(t.pdf_mostra_recupero_fiscale).toBe(false);
    expect(t.pdf_blocchi?.modulo_esclusioni).toContain("Nessuna classe antieffrazione è presunta");
    expect(t.faq_items?.[0].risposta).toContain("caratteristiche documentate");
  });
  it("ripristina il contenuto originale della porta e conserva i testi personalizzati", () => {
    const old = { ...createSerramentiModuleTemplate({}, "porte-ingresso"), pdf_cover_hero: "Ingresso personalizzato" };
    const t = upgradeSerramentiModuleTemplate(old, {}, "porte-ingresso");
    expect(t.pdf_cover_hero).toBe("Ingresso personalizzato");
    const b = { ...t.pdf_blocchi }; delete b.documenti;
    expect(leggiBlocco("documenti", "serramenti", b).voci[0].titolo).toBe("Scheda della porta");
  });
  it("offre varianti applicabili a un campo alla volta", () => {
    const options = serramentiCopyChoices("porte-ingresso", createFullSerramentiTemplate({}, "porte-ingresso"));
    expect(options).toHaveLength(10);
    for (const option of options) expect(Object.keys(option.patch)).toHaveLength(1);
  });
});
