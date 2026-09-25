import { describe, expect, it } from "vitest";
import type { TetTemplatePdf } from "@/types/tetti";
import { createFullTettiTemplate, isFullTettiTemplate, upgradeTettiModuleTemplate } from "@/lib/moduli-vendita/fullTettiModules";
import { createTettiModuleTemplate, buildTettiTemplatePreview } from "@/lib/moduli-vendita/tettiTemplateModules";
import { ripassoCopyChoices } from "@/lib/moduli-vendita/tettiInterventionCopy";
import { leggiBlocco, leggiFotoPagina, fotoDellaLibreria } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { eTavola } from "../../../supabase/functions/_shared/proporzioniImmagine";
const base = { id: "online", company_id: "company-a", logo_url: "/brand.png", default_iva_pct: 22 } as TetTemplatePdf;

describe("Ripasso: edizione originale completa", () => {
  it("mantiene tutte le sezioni originali con testi specifici e nessuna prova inventata", () => {
    const t = createFullTettiTemplate(base, "ripasso");
    expect(isFullTettiTemplate(t)).toBe(true);
    expect(t.logo_url).toBe(base.logo_url);
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.pdf_ordine_capitoli!.findIndex(p => p.chiave === "piano")).toBeLessThan(t.pdf_ordine_capitoli!.findIndex(p => p.chiave === "investimento"));
    expect(t.faq.length).toBeGreaterThanOrEqual(7);
    expect(t.percorso).toHaveLength(4);
    expect(t.esigenze.every(v => v.descrizione)).toBe(true);
    expect(t.testimonianze).toEqual([]);
    expect(t.gallery_lavori).toEqual([]);
    expect(t.default_detrazione_pct).toBe(0);
    expect(t.condizioni_legali_attivo).toBe(false);
    expect(base.cover_title).toBeUndefined();
  });
  it("ripristina i blocchi Ripasso e non testi o foto del rifacimento integrale", () => {
    const t = createFullTettiTemplate(base, "ripasso");
    const { comeFunziona: _removed, ...blocks } = t.pdf_blocchi!;
    expect(leggiBlocco("comeFunziona", "tetti", blocks).titolo).toContain("Recuperare");
    expect(leggiBlocco("comeFunziona", "tetti", blocks).foto).toEqual(["/module-art/tetti-ripasso-dettagli.jpg"]);
    expect(leggiFotoPagina("computo", "tetti", { modulo_defaults: blocks.modulo_defaults })).toBeNull();
    expect(fotoDellaLibreria("tetti", blocks).every(f => /^\/(module-art|pdf-stock\/(tetti|comune))\//.test(f.url))).toBe(true);
    expect(eTavola("/module-art/tetti-ripasso-dettagli.jpg")).toBeCloseTo(2 / 3);
  });
  it("aggiorna solo i default invariati, mantenendo titoli, blocchi e ordine personalizzati", () => {
    const old = createTettiModuleTemplate(base, "ripasso");
    old.cover_title = "Titolo mio";
    old.pdf_blocchi!.controlli = { titolo: "Controlli miei", foto: ["data:image/png;base64,custom"] };
    old.pdf_ordine_capitoli = [{ chiave: "investimento", visibile: true }];
    const copy = structuredClone(old);
    const next = upgradeTettiModuleTemplate(old, base, "ripasso");
    expect(next.cover_title).toBe("Titolo mio");
    expect(next.pdf_blocchi!.controlli).toEqual(old.pdf_blocchi!.controlli);
    expect(next.pdf_ordine_capitoli).toEqual(old.pdf_ordine_capitoli);
    expect(next.faq.length).toBeGreaterThan(old.faq.length);
    expect(old).toEqual(copy);
  });
  it("offre varianti sezionali senza cambiare immagini, condizioni o altre sezioni", () => {
    const choices = ripassoCopyChoices(createFullTettiTemplate(base, "ripasso"));
    expect(choices).toHaveLength(11);
    expect(new Set(choices.map(c => c.id)).size).toBe(choices.length);
    for (const choice of choices) {
      expect(Object.keys(choice.patch).every(k => ["cover_title", "cover_subtitle", "esigenze", "soluzione", "percorso", "usp"].includes(k))).toBe(true);
      expect(choice.preview.length).toBeGreaterThan(50);
    }
  });
  it("usa misure e righe pertinenti nelle anteprime senza dichiarare prezzi reali", () => {
    const payload = buildTettiTemplatePreview(base.company_id, createFullTettiTemplate(base, "ripasso"), "ripasso");
    expect(payload.computo[2].unita_misura).toBe("cad");
    expect(payload.progetto.numero_falde).toBe(2);
    expect(payload.progetto.note).toMatch(/dimostrativi/);
  });
});
