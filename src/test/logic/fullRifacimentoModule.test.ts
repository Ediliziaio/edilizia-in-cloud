import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import type { TetTemplatePdf } from "@/types/tetti";
import { createFullTettiTemplate, upgradeTettiModuleTemplate } from "@/lib/moduli-vendita/fullTettiModules";
import { createTettiModuleTemplate } from "@/lib/moduli-vendita/tettiTemplateModules";
import { tettiCopyChoices } from "@/lib/moduli-vendita/tettiInterventionCopy";
import { fotoDellaLibreria, leggiBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";
const base = { id: "online", company_id: "qa", logo_url: "/logo.png" } as TetTemplatePdf;
describe("Rifacimento: pagine originali complete", () => {
  it("la libreria ammette gli asset locali curati, non URL remoti o percorsi arbitrari", () => {
    const urls = ["/module-art/tetti.jpg", "/pdf-stock/tetti/isolamento.jpg", "/cover-stock/tetti/1.jpg", "https://example.com/foto.jpg", "/module-art/../private.jpg", "/uploads/foto.jpg"];
    expect(fotoDellaLibreria("tetti", { modulo_foto: urls.map(url => ({ url, nome: "Foto" })) }).map(f => f.url)).toEqual(urls.slice(0, 3));
  });
  it("ha contenuti specifici, immagini esistenti e nessuna prova aziendale inventata", () => {
    const t = createFullTettiTemplate(base, "rifacimento");
    expect(t.pdf_blocchi?.modulo_edizione).toBe(2);
    expect(t.logo_url).toBe(base.logo_url);
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.faq).toHaveLength(8);
    expect(t.esigenze).toHaveLength(3);
    expect(t.soluzione).toHaveLength(3);
    expect(t.percorso).toHaveLength(4);
    expect(t.cronoprogramma).toHaveLength(4);
    expect(t.garanzie).toHaveLength(4);
    expect(t.testimonianze).toEqual([]);
    expect(t.gallery_lavori).toEqual([]);
    expect(t.condizioni_legali_attivo).toBe(false);
    expect(t.default_detrazione_pct).toBe(0);
    const images = fotoDellaLibreria("tetti", t.pdf_blocchi);
    expect(images.map(image => image.url)).toEqual(expect.arrayContaining([
      "/module-art/tetti.jpg", "/pdf-stock/tetti/isolamento.jpg", "/pdf-stock/tetti/protezione.jpg",
    ]));
    for (const image of images) expect(existsSync(`public${image.url}`)).toBe(true);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const b = leggiBlocco(key, "tetti", t.pdf_blocchi);
      expect(b.voci.length).toBeGreaterThanOrEqual(3);
      expect(b.voci.every(v => !!v.testo)).toBe(true);
    }
  });
  it("mantiene personalizzazioni e ripristina i default corretti del modulo", () => {
    const saved = createTettiModuleTemplate(base, "rifacimento");
    saved.cover_title = "Titolo mio";
    saved.pdf_blocchi!.controlli = { titolo: "Controlli miei", foto: ["/mia.jpg"] };
    const next = upgradeTettiModuleTemplate(saved, base, "rifacimento");
    expect(next.cover_title).toBe("Titolo mio");
    expect(next.pdf_blocchi!.controlli).toEqual(saved.pdf_blocchi!.controlli);
    const { comeFunziona: _deleted, ...blocks } = next.pdf_blocchi!;
    expect(leggiBlocco("comeFunziona", "tetti", blocks).titolo).toContain("insieme di scelte");
    expect(leggiBlocco("comeFunziona", "tetti", blocks).foto).toEqual(["/pdf-stock/tetti/isolamento.jpg"]);
  });
  it("offre dieci varianti indipendenti e non cambia altri campi", () => {
    const choices = tettiCopyChoices("rifacimento", createFullTettiTemplate(base, "rifacimento"));
    expect(choices).toHaveLength(10);
    expect(new Set(choices.map(c => c.id)).size).toBe(10);
    for (const c of choices) expect(Object.keys(c.patch)).toHaveLength(1);
  });
});
