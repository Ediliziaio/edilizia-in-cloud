import { describe, expect, it } from "vitest";
import { createFullSerramentiTemplate, upgradeSerramentiModuleTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { createSerramentiModuleTemplate } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { serramentiCopyChoices } from "@/lib/moduli-vendita/serramentiInterventionCopy";
import { leggiBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
const base = { company_id: "qa" };
describe("Avvolgibili: edizione originale completa", () => {
  it("comprende tutte le sezioni dedicate, senza ereditare promesse sulle finestre", () => {
    const t = createFullSerramentiTemplate(base, "avvolgibili");
    expect(t.esigenze_default).toHaveLength(3);
    expect(t.soluzione_default).toHaveLength(3);
    expect(t.percorso_cliente?.fasi).toHaveLength(4);
    expect(t.garanzie).toHaveLength(4);
    expect(t.faq_items).toHaveLength(8);
    expect(t.pdf_cover_image_url).toBe("/module-art/serramenti-avvolgibili-cover.jpg");
    expect(t.testimonianze_default).toEqual([]);
    expect(t.condizioni_legali_attivo).toBe(false);
    expect(JSON.stringify(t.pdf_blocchi)).not.toMatch(/vetrocamera|warm edge|trasmittanza/);
    expect(t.faq_items?.find(f => f.domanda.includes("cassonetto"))?.risposta).toContain("Solo se indicato");
  });
  it("ripristina i blocchi dell'intervento dopo una personalizzazione", () => {
    const t = createFullSerramentiTemplate(base, "avvolgibili");
    const b = { ...t.pdf_blocchi }; delete b.comeFunziona;
    const block = leggiBlocco("comeFunziona", "serramenti", b);
    expect(block.voci.map(v => v.titolo)).toEqual(["Telo", "Guide e rullo", "Cassonetto", "Comando"]);
  });
  it("conserva foto, titolo e condizioni personalizzati durante l'aggiornamento", () => {
    const old = { ...createSerramentiModuleTemplate(base, "avvolgibili"), pdf_cover_hero: "Offerta mia", pdf_cover_image_url: "/mia.jpg", condizioni_legali_testo: "Condizioni approvate", condizioni_legali_attivo: true };
    const next = upgradeSerramentiModuleTemplate(old, base, "avvolgibili");
    expect(next.pdf_cover_hero).toBe(old.pdf_cover_hero);
    expect(next.pdf_cover_image_url).toBe(old.pdf_cover_image_url);
    expect(next.condizioni_legali_testo).toBe(old.condizioni_legali_testo);
    expect(next.condizioni_legali_attivo).toBe(true);
    expect(next.percorso_cliente?.attivo).toBe(true);
  });
  it("propone dieci testi indipendenti senza toccare immagini e contratto", () => {
    const choices = serramentiCopyChoices("avvolgibili", createFullSerramentiTemplate(base, "avvolgibili"));
    expect(choices).toHaveLength(10);
    for (const c of choices) expect(Object.keys(c.patch)).toHaveLength(1);
  });
});
