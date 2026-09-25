import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import type { TetTemplatePdf } from "@/types/tetti";
import { createFullTettiTemplate, FULL_TETTI_MODULES, upgradeTettiModuleTemplate } from "@/lib/moduli-vendita/fullTettiModules";
import { createTettiModuleTemplate, buildTettiTemplatePreview } from "@/lib/moduli-vendita/tettiTemplateModules";
import { tettiCopyChoices } from "@/lib/moduli-vendita/tettiInterventionCopy";
import { fotoDellaLibreria, leggiBlocco, leggiFotoPagina } from "../../../supabase/functions/_shared/blocchiPreventivo";
const base = { id: "online", company_id: "qa" } as TetTemplatePdf;
describe.each(["riparazioni", "isolamento", "impermeabilizzazione", "lattoneria"] as const)("Edizione originale %s", id => {
  it("ha tutte le sezioni e immagini locali pertinenti, senza prove inventate", () => {
    const t = createFullTettiTemplate(base, id);
    expect(FULL_TETTI_MODULES).toContain(id);
    expect(t.pdf_blocchi?.modulo_edizione).toBe(2);
    expect(t.pdf_ordine_capitoli?.every(c => c.visibile)).toBe(true);
    expect(t.esigenze).toHaveLength(3); expect(t.soluzione).toHaveLength(3); expect(t.usp).toHaveLength(3);
    expect(t.percorso).toHaveLength(4); expect(t.cronoprogramma).toHaveLength(4); expect(t.garanzie).toHaveLength(4); expect(t.faq).toHaveLength(8);
    expect(t.gallery_lavori).toEqual([]); expect(t.testimonianze).toEqual([]);
    expect(t.default_detrazione_pct).toBe(0); expect(t.condizioni_legali_attivo).toBe(false);
    const images = fotoDellaLibreria("tetti", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(2);
    for (const i of images) { expect(existsSync(`public${i.url}`)).toBe(true); expect(i.nome).toContain("illustrativ"); }
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const b = leggiBlocco(key, "tetti", t.pdf_blocchi);
      expect(b.voci.length).toBeGreaterThanOrEqual(3);
      expect(b.voci.every(v => v.testo && v.testo.length > 30)).toBe(true);
    }
    expect(leggiBlocco("compreso", "tetti", t.pdf_blocchi).escluse).toHaveLength(2);
    expect(leggiFotoPagina("domande", "tetti", t.pdf_blocchi)).toBeNull();
    expect(images.map(i => i.url)).toContain(leggiFotoPagina("percorso", "tetti", t.pdf_blocchi));
  });
  it("aggiorna solo i default invariati e ripristina quelli del proprio intervento", () => {
    const old = createTettiModuleTemplate(base, id);
    old.cover_title = "Titolo personalizzato";
    old.pdf_blocchi!.documenti = { titolo: "Documenti personalizzati", foto: ["/mia.jpg"] };
    const next = upgradeTettiModuleTemplate(old, base, id);
    expect(next.cover_title).toBe(old.cover_title);
    expect(next.pdf_blocchi!.documenti).toEqual(old.pdf_blocchi!.documenti);
    const { comeFunziona: _removed, ...blocks } = next.pdf_blocchi!;
    expect(leggiBlocco("comeFunziona", "tetti", blocks)).toEqual(leggiBlocco("comeFunziona", "tetti", createFullTettiTemplate(base, id).pdf_blocchi));
  });
  it("ha dieci varianti testuali a campo singolo", () => {
    const choices = tettiCopyChoices(id, createFullTettiTemplate(base, id));
    expect(choices).toHaveLength(10);
    expect(new Set(choices.map(c => c.id)).size).toBe(10);
    for (const c of choices) expect(Object.keys(c.patch)).toHaveLength(1);
  });
  it("non presume due falde nelle anteprime di interventi specifici", () => {
    const preview = buildTettiTemplatePreview("qa", createFullTettiTemplate(base, id), id);
    expect(preview.progetto.numero_falde).toBeNull();
    if (id === "impermeabilizzazione") expect(preview.progetto.superficie_pianta_mq).toBe(80);
    if (id === "lattoneria" || id === "riparazioni") expect(preview.progetto.superficie_pianta_mq).toBeNull();
  });
});
