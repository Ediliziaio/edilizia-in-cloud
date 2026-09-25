import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { createFullRstTemplate, buildRstModulePreview } from "@/lib/moduli-vendita/fullRstModules";
import { rstCopyChoices } from "@/lib/moduli-vendita/rstInterventionCopy";
import { RST_PHOTO_CORRECTIONS } from "@/lib/moduli-vendita/rstPhotoCorrections";
import { loadLocalRstTemplate, saveLocalRstTemplate, localRstTemplateKey } from "@/lib/moduli-vendita/localRstTemplates";
import type { RstTemplatePdf } from "@/types/ristrutturazione";
import { fotoDellaLibreria, leggiBlocco, leggiFotoPagina } from "../../../supabase/functions/_shared/blocchiPreventivo";
const base = { id: "online", company_id: "qa", default_iva_pct: 22 } as RstTemplatePdf;
const make = () => createFullRstTemplate(base, "completa");
const storage = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
};
describe("Ristrutturazione completa originale", () => {
  it("assegna le correzioni ai blocchi nativi e ai defaults, senza riempitivi o gallerie fittizie", () => {
    for (const id of ["completa", "parziale", "commerciale", "spazi", "computo"] as const) {
      const t = createFullRstTemplate(base, id);
      for (const [key, correction] of Object.entries(RST_PHOTO_CORRECTIONS[id])) {
        const block = t.pdf_blocchi?.[key] as { foto: string[]; senzaFoto: boolean; nota?: string };
        expect(block.foto).toEqual([correction.newUrl]);
        expect(block.senzaFoto).toBe(false);
        expect(existsSync(`public${correction.newUrl}`)).toBe(true);
        expect(correction.newUrl).not.toBe(correction.oldUrl);
        expect((t.pdf_blocchi?.modulo_defaults as Record<string, unknown>)[key]).toEqual(block);
        if (!key.startsWith("pagina_")) expect(block.nota).toContain("illustrativa");
      }
      for (const key of ["computo", "compreso", "percorso", "tempi", "chiSiamo", "garanzie", "domande"] as const)
        expect(leggiFotoPagina(key, "ristrutturazione", t.pdf_blocchi)).toBeNull();
      expect(t.gallery_lavori).toEqual([]); expect(t.testimonianze).toEqual([]);
    }
    const computo = createFullRstTemplate(base, "computo");
    const closing = leggiFotoPagina("chiusura", "ristrutturazione", computo.pdf_blocchi);
    expect(closing).toBe("/module-art/pavimenti.jpg");
    expect(closing).not.toBe(computo.cover_image_url);
    for (const id of ["completa", "computo"] as const) {
      const t = createFullRstTemplate(base, id);
      const urls = ["comeFunziona", "controlli", "diario"].map(key => (t.pdf_blocchi?.[key] as { foto: string[] }).foto[0]);
      expect(new Set(urls).size).toBe(3);
    }
  });
  it("offre un computo completo con quantità, esclusioni e contenuti indipendenti", () => {
    const t = createFullRstTemplate(base, "computo");
    expect(t.id).toBe("local-ristrutturazioni-computo");
    expect(t.pdf_blocchi?.modulo_intervento).toBe("computo");
    expect(t.cover_title).toBe("Ogni lavorazione.\nUn prezzo leggibile.");
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.faq).toHaveLength(8); expect(t.percorso).toHaveLength(4);
    expect(t.cronoprogramma).toHaveLength(4); expect(t.garanzie).toHaveLength(4);
    expect(t.esigenze).toHaveLength(3); expect(t.soluzione).toHaveLength(3);
    const images = fotoDellaLibreria("ristrutturazione", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const image of images) expect(existsSync(`public${image.url}`)).toBe(true);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "ristrutturazione", t.pdf_blocchi);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.voci.every(v => v.testo && v.testo.length > 20)).toBe(true);
    }
    expect(leggiBlocco("compreso", "ristrutturazione", t.pdf_blocchi).escluse).toHaveLength(2);
    expect(t.faq.some(f => f.domanda.includes("quantità") && f.risposta.includes("contabilizzazione"))).toBe(true);
    expect(t.faq.some(f => f.domanda.includes("totale") && f.risposta.includes("non definisce"))).toBe(true);
    const choices = rstCopyChoices("computo", t);
    expect(choices).toHaveLength(10);
    for (const c of choices) expect(Object.keys(c.patch)).toHaveLength(1);
    expect(JSON.stringify(choices)).not.toMatch(/Nuovo layout|Locale ufficio|Zona soggiorno|Ristrutturazione completa/);
    const p = buildRstModulePreview("qa", t, "computo");
    expect(p.progetto.tipo_intervento).toBe("Intervento a computo");
    expect(p.progetto.immobile_superficie_mq).toBeNull();
    expect(p.progetto.detrazione_pct).toBe(0);
    expect(p.progetto.totale_imponibile).toBe(3083);
    expect(p.progetto.totale).toBe(3761.26);
    expect(new Set(p.computo.map(r => r.unita_misura))).toEqual(new Set(["mq", "ml", "corpo"]));
    expect(p.computo.every(r => r.descrizione.startsWith("Ambito A:"))).toBe(true);
    const s = storage();
    saveLocalRstTemplate("qa", "completa", make(), null, s);
    saveLocalRstTemplate("qa", "computo", t, null, s);
    expect(loadLocalRstTemplate("qa", "completa", s)?.template.cover_title).toBe(make().cover_title);
    expect(loadLocalRstTemplate("qa", "computo", s)?.template.cover_title).toBe(t.cover_title);
  });
  it("distingue Redistribuzione da un rifacimento completo e conserva tutte le pagine originali", () => {
    const t = createFullRstTemplate(base, "spazi");
    expect(t.id).toBe("local-ristrutturazioni-spazi");
    expect(t.pdf_blocchi?.modulo_intervento).toBe("spazi");
    expect(t.cover_title).toContain("Nuovi spazi");
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.faq).toHaveLength(8); expect(t.percorso).toHaveLength(4);
    expect(t.cronoprogramma).toHaveLength(4); expect(t.garanzie).toHaveLength(4);
    expect(t.esigenze).toHaveLength(3); expect(t.soluzione).toHaveLength(3);
    const images = fotoDellaLibreria("ristrutturazione", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const image of images) expect(existsSync(`public${image.url}`)).toBe(true);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "ristrutturazione", t.pdf_blocchi);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.voci.every(v => v.testo && v.testo.length > 20)).toBe(true);
    }
    expect(leggiBlocco("compreso", "ristrutturazione", t.pdf_blocchi).escluse).toHaveLength(2);
    expect(t.faq[0].risposta).toContain("Non si può presumere");
    const choices = rstCopyChoices("spazi", t);
    expect(choices).toHaveLength(10);
    for (const c of choices) expect(Object.keys(c.patch)).toHaveLength(1);
    expect(JSON.stringify(choices)).not.toMatch(/Locale ufficio|Zona soggiorno|Ristrutturazione completa/);
    const p = buildRstModulePreview("qa", t, "spazi");
    expect(p.progetto.tipo_intervento).toBe("Redistribuzione degli spazi");
    expect(p.progetto.immobile_superficie_mq).toBeNull();
    expect(p.progetto.detrazione_pct).toBe(0);
    expect(p.progetto.totale_imponibile).toBe(5644);
    expect(p.progetto.totale).toBe(6885.68);
    expect(p.computo.every(r => r.descrizione.startsWith("Nuovo layout:"))).toBe(true);
    const s = storage();
    saveLocalRstTemplate("qa", "completa", make(), null, s);
    saveLocalRstTemplate("qa", "spazi", t, null, s);
    expect(loadLocalRstTemplate("qa", "completa", s)?.template.cover_title).toBe(make().cover_title);
    expect(loadLocalRstTemplate("qa", "spazi", s)?.template.cover_title).toBe(t.cover_title);
  });
  it("crea Negozi e uffici con ambito commerciale, immagini e anteprima propri", () => {
    const t = createFullRstTemplate(base, "commerciale");
    expect(t.id).toBe("local-ristrutturazioni-commerciale");
    expect(t.pdf_blocchi?.modulo_intervento).toBe("commerciale");
    expect(t.cover_title).toContain("attività");
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.faq).toHaveLength(8); expect(t.percorso).toHaveLength(4);
    expect(t.cronoprogramma).toHaveLength(4); expect(t.garanzie).toHaveLength(4);
    expect(t.esigenze).toHaveLength(3); expect(t.soluzione).toHaveLength(3);
    const images = fotoDellaLibreria("ristrutturazione", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const image of images) expect(existsSync(`public${image.url}`)).toBe(true);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "ristrutturazione", t.pdf_blocchi);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.voci.every(v => v.testo && v.testo.length > 20)).toBe(true);
    }
    expect(leggiBlocco("compreso", "ristrutturazione", t.pdf_blocchi).escluse).toHaveLength(2);
    expect(leggiBlocco("protezione", "ristrutturazione", t.pdf_blocchi).intro).toContain("senza presumere");
    expect(t.faq.some(f => f.risposta.includes("autorizzazione all'esercizio"))).toBe(true);
    const choices = rstCopyChoices("commerciale", t);
    expect(choices).toHaveLength(10);
    for (const c of choices) expect(Object.keys(c.patch)).toHaveLength(1);
    expect(JSON.stringify(choices)).not.toMatch(/tua casa|Zona soggiorno|Ristrutturazione completa/);
    const p = buildRstModulePreview("qa", t, "commerciale");
    expect(p.progetto.tipo_intervento).toBe("Negozi e uffici");
    expect(p.progetto.immobile_tipo).toBe("Ufficio");
    expect(p.progetto.immobile_superficie_mq).toBeNull();
    expect(p.progetto.detrazione_pct).toBe(0);
    expect(p.progetto.totale_imponibile).toBe(10330);
    expect(p.progetto.totale).toBe(12602.6);
    expect(p.computo.every(r => r.descrizione.startsWith("Locale ufficio:"))).toBe(true);
    const s = storage();
    saveLocalRstTemplate("qa", "completa", make(), null, s);
    saveLocalRstTemplate("qa", "commerciale", t, null, s);
    expect(loadLocalRstTemplate("qa", "completa", s)?.template.cover_title).toBe(make().cover_title);
    expect(loadLocalRstTemplate("qa", "commerciale", s)?.template.cover_title).toBe(t.cover_title);
  });
  it("crea una Parziale indipendente con sei blocchi e tre immagini pertinenti", () => {
    const t = createFullRstTemplate(base, "parziale");
    expect(t.id).toBe("local-ristrutturazioni-parziale");
    expect(t.pdf_blocchi?.modulo_intervento).toBe("parziale");
    expect(t.cover_title).toContain("Conserva");
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.faq).toHaveLength(8); expect(t.percorso).toHaveLength(4);
    expect(t.cronoprogramma).toHaveLength(4); expect(t.garanzie).toHaveLength(4);
    expect(t.esigenze).toHaveLength(3); expect(t.soluzione).toHaveLength(3);
    const images = fotoDellaLibreria("ristrutturazione", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const image of images) expect(existsSync(`public${image.url}`)).toBe(true);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "ristrutturazione", t.pdf_blocchi);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.voci.every(v => v.testo && v.testo.length > 20)).toBe(true);
    }
    expect(leggiBlocco("compreso", "ristrutturazione", t.pdf_blocchi).escluse).toHaveLength(2);
    expect(leggiFotoPagina("investimento", "ristrutturazione", t.pdf_blocchi)).toBeNull();
    const choices = rstCopyChoices("parziale", t);
    expect(choices).toHaveLength(10);
    for (const c of choices) expect(Object.keys(c.patch)).toHaveLength(1);
    expect(JSON.stringify(choices)).not.toContain("Ristrutturazione completa");
    const p = buildRstModulePreview("qa", t, "parziale");
    expect(p.progetto.tipo_intervento).toBe("Ristrutturazione parziale");
    expect(p.progetto.immobile_superficie_mq).toBeNull();
    expect(p.progetto.detrazione_pct).toBe(0);
    expect(p.progetto.totale_imponibile).toBe(4020);
    expect(p.progetto.totale).toBe(4904.4);
    expect(p.computo.every(r => r.descrizione.startsWith("Zona soggiorno:"))).toBe(true);
    const s = storage();
    saveLocalRstTemplate("qa", "completa", make(), null, s);
    saveLocalRstTemplate("qa", "parziale", t, null, s);
    expect(loadLocalRstTemplate("qa", "completa", s)?.template.cover_title).toBe(make().cover_title);
    expect(loadLocalRstTemplate("qa", "parziale", s)?.template.cover_title).toBe(t.cover_title);
  });
  it("ha contenuti specifici, tutte le pagine e immagini locali selezionate", () => {
    const t = make();
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.faq).toHaveLength(8); expect(t.percorso).toHaveLength(4);
    expect(t.cronoprogramma).toHaveLength(4); expect(t.garanzie).toHaveLength(4);
    expect(t.esigenze).toHaveLength(3); expect(t.soluzione).toHaveLength(3);
    expect(t.gallery_lavori).toEqual([]); expect(t.testimonianze).toEqual([]);
    expect(t.default_detrazione_pct).toBe(0); expect(t.condizioni_legali_attivo).toBe(false);
    const images = fotoDellaLibreria("ristrutturazione", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const i of images) expect(existsSync(`public${i.url}`)).toBe(true);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "ristrutturazione", t.pdf_blocchi);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.voci.every(v => v.testo && v.testo.length > 20)).toBe(true);
    }
    expect(leggiBlocco("compreso", "ristrutturazione", t.pdf_blocchi).escluse).toHaveLength(2);
    expect(leggiFotoPagina("investimento", "ristrutturazione", t.pdf_blocchi)).toBe("/pdf-stock/ristrutturazione/risultato.jpg");
    expect(leggiFotoPagina("chiusura", "ristrutturazione", t.pdf_blocchi)).toBeTruthy();
    for (const key of ["computo", "compreso", "percorso", "tempi", "chiSiamo", "garanzie", "domande"] as const)
      expect(leggiFotoPagina(key, "ristrutturazione", t.pdf_blocchi)).toBeNull();
    expect(base.id).toBe("online");
  });
  it("offre dieci testi a campo singolo e usa un solo esempio economico", () => {
    const t = make(), choices = rstCopyChoices("completa", t);
    expect(choices).toHaveLength(10);
    expect(new Set(choices.map(c => c.id)).size).toBe(10);
    for (const c of choices) expect(Object.keys(c.patch)).toHaveLength(1);
    const p = buildRstModulePreview("qa", t, "completa");
    expect(p.computo).toHaveLength(6); expect(p.progetto.detrazione_pct).toBe(0);
    expect(p.progetto.totale_imponibile).toBe(19105);
    expect(p.progetto.totale).toBe(23308.1);
    expect(t.pdf_cover_hero).toBeNull();
  });
  it("salva e rilegge la stessa copia senza modificare la bozza precedente", () => {
    const s = storage(); s.setItem("vecchia-bozza", "conservata");
    const record = saveLocalRstTemplate("qa", "completa", make(), null, s);
    expect(loadLocalRstTemplate("qa", "completa", s)).toEqual(record);
    expect(loadLocalRstTemplate("altra-azienda", "completa", s)).toBeNull();
    expect(s.getItem("vecchia-bozza")).toBe("conservata");
  });
  it("blocca schede obsolete e conserva il record corrente", () => {
    const s = storage(), first = saveLocalRstTemplate("qa", "completa", make(), null, s);
    const second = saveLocalRstTemplate("qa", "completa", { ...make(), cover_title: "Personalizzato" }, first.savedAt, s);
    expect(() => saveLocalRstTemplate("qa", "completa", make(), first.savedAt, s)).toThrow("altra scheda");
    expect(loadLocalRstTemplate("qa", "completa", s)).toEqual(second);
  });
  it("non sovrascrive dati corrotti o di un'altra azienda", () => {
    const s = storage(), key = localRstTemplateKey("qa", "completa");
    s.setItem(key, "{");
    expect(() => saveLocalRstTemplate("qa", "completa", make(), null, s)).toThrow();
    expect(s.getItem(key)).toBe("{");
    s.setItem(key, JSON.stringify({ version: 1, companyId: "altra", moduleId: "completa", savedAt: new Date().toISOString(), template: make() }));
    expect(() => loadLocalRstTemplate("qa", "completa", s)).toThrow();
  });
  it("segnala la quota senza falsi successi", () => {
    expect(() => saveLocalRstTemplate("qa", "completa", make(), null, { getItem: () => null, setItem: () => { throw new Error("quota"); } })).toThrow("spazio esaurito");
  });
});
