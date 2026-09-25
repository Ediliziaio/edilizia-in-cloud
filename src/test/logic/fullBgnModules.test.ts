import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { createFullBgnTemplate, buildBgnModulePreview } from "@/lib/moduli-vendita/fullBgnModules";
import { bgnCopyChoices } from "@/lib/moduli-vendita/bgnInterventionCopy";
import { loadLocalBgnTemplate, saveLocalBgnTemplate, localBgnTemplateKey } from "@/lib/moduli-vendita/localBgnTemplates";
import type { BgnTemplatePdf } from "@/types/bagni";
import { fotoDellaLibreria, leggiBlocco, leggiFotoPagina } from "../../../supabase/functions/_shared/blocchiPreventivo";
const base = { id: "online", company_id: "qa", default_iva_pct: 22 } as BgnTemplatePdf;
const make = () => createFullBgnTemplate(base, "completo");
const storage = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
};
describe("Bagno completo originale", () => {
  it("limita Rinnovo estetico a finiture e dotazioni esplicite", () => {
    const t = createFullBgnTemplate(base, "rinnovo");
    expect(t.id).toBe("local-bagni-rinnovo");
    expect(t.pdf_blocchi?.modulo_intervento).toBe("rinnovo");
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.faq).toHaveLength(8); expect(t.percorso).toHaveLength(4);
    expect(t.garanzie).toHaveLength(4); expect(t.cronoprogramma).toHaveLength(4);
    expect(t.esigenze).toHaveLength(3); expect(t.soluzione).toHaveLength(3); expect(t.usp).toHaveLength(3);
    expect(t.testimonianze).toEqual([]); expect(t.gallery_lavori).toEqual([]);
    const images = fotoDellaLibreria("bagni", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const image of images) expect(existsSync(`public${image.url}`)).toBe(true);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "bagni", t.pdf_blocchi);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.voci.every(v => v.testo && v.testo.length > 20)).toBe(true);
    }
    expect(leggiBlocco("compreso", "bagni", t.pdf_blocchi).escluse).toHaveLength(2);
    expect(t.faq.some(f => f.domanda.includes("infiltrazioni") && f.risposta.startsWith("No,"))).toBe(true);
    const choices = bgnCopyChoices("rinnovo", t); expect(choices).toHaveLength(10);
    for (const choice of choices) expect(Object.keys(choice.patch)).toHaveLength(1);
    const p = buildBgnModulePreview("qa", t, "rinnovo");
    expect(p.progetto.tipo_intervento).toBe("Rinnovo estetico");
    expect(p.progetto.immobile_superficie_mq).toBeNull(); expect(p.progetto.detrazione_pct).toBe(0);
    expect(p.computo).toHaveLength(7);
    expect(p.computo.every(r => r.descrizione.startsWith("Rinnovo:"))).toBe(true);
    expect(JSON.stringify(p.computo)).not.toMatch(/impianto|doccia|demolizione|impermeabilizzazione/);
    expect(p.progetto.totale_imponibile).toBe(1254); expect(p.progetto.totale).toBe(1529.88);
    const s = storage(), other = createFullBgnTemplate(base, "accessibilita");
    saveLocalBgnTemplate("qa", "accessibilita", other, null, s);
    saveLocalBgnTemplate("qa", "rinnovo", t, null, s);
    expect(loadLocalBgnTemplate("qa", "accessibilita", s)?.template.cover_title).toBe(other.cover_title);
    expect(loadLocalBgnTemplate("qa", "rinnovo", s)?.template.cover_title).toBe(t.cover_title);
  });
  it("prepara Bagno accessibile senza certificazioni, dotazioni o agevolazioni implicite", () => {
    const t = createFullBgnTemplate(base, "accessibilita");
    expect(t.id).toBe("local-bagni-accessibilita");
    expect(t.pdf_blocchi?.modulo_intervento).toBe("accessibilita");
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.faq).toHaveLength(8); expect(t.percorso).toHaveLength(4);
    expect(t.garanzie).toHaveLength(4); expect(t.cronoprogramma).toHaveLength(4);
    expect(t.esigenze).toHaveLength(3); expect(t.soluzione).toHaveLength(3); expect(t.usp).toHaveLength(3);
    expect(t.testimonianze).toEqual([]); expect(t.gallery_lavori).toEqual([]);
    expect(t.default_detrazione_pct).toBe(0);
    const images = fotoDellaLibreria("bagni", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const image of images) expect(existsSync(`public${image.url}`)).toBe(true);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "bagni", t.pdf_blocchi);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.voci.every(v => v.testo && v.testo.length > 20)).toBe(true);
    }
    expect(leggiBlocco("compreso", "bagni", t.pdf_blocchi).escluse).toHaveLength(2);
    expect(t.faq[0].risposta).toContain("No. Il modello organizza una proposta commerciale.");
    expect(t.faq.some(f => f.risposta.includes("non assegna portate o dimensioni universali"))).toBe(true);
    const choices = bgnCopyChoices("accessibilita", t);
    expect(choices).toHaveLength(10);
    for (const choice of choices) expect(Object.keys(choice.patch)).toHaveLength(1);
    const p = buildBgnModulePreview("qa", t, "accessibilita");
    expect(p.progetto.tipo_intervento).toBe("Bagno accessibile");
    expect(p.progetto.accessibile).toBe(false); // A template selection is not a conformity assessment.
    expect(p.progetto.immobile_superficie_mq).toBeNull(); expect(p.progetto.detrazione_pct).toBe(0);
    expect(p.computo).toHaveLength(8);
    expect(p.computo.every(r => r.descrizione.startsWith("Adattamento:"))).toBe(true);
    expect(p.progetto.totale_imponibile).toBe(3780); expect(p.progetto.totale).toBe(4611.6);
    const s = storage(), other = createFullBgnTemplate(base, "sanitari");
    saveLocalBgnTemplate("qa", "sanitari", other, null, s);
    saveLocalBgnTemplate("qa", "accessibilita", t, null, s);
    expect(loadLocalBgnTemplate("qa", "sanitari", s)?.template.cover_title).toBe(other.cover_title);
    expect(loadLocalBgnTemplate("qa", "accessibilita", s)?.template.cover_title).toBe(t.cover_title);
  });
  it("separa Sanitari e rubinetteria dalle opere di ristrutturazione", () => {
    const t = createFullBgnTemplate(base, "sanitari");
    expect(t.id).toBe("local-bagni-sanitari");
    expect(t.pdf_blocchi?.modulo_intervento).toBe("sanitari");
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.faq).toHaveLength(8); expect(t.percorso).toHaveLength(4);
    expect(t.garanzie).toHaveLength(4); expect(t.cronoprogramma).toHaveLength(4);
    expect(t.esigenze).toHaveLength(3); expect(t.soluzione).toHaveLength(3); expect(t.usp).toHaveLength(3);
    expect(t.testimonianze).toEqual([]); expect(t.gallery_lavori).toEqual([]);
    expect(t.default_detrazione_pct).toBe(0);
    const images = fotoDellaLibreria("bagni", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(4);
    for (const image of images) expect(existsSync(`public${image.url}`)).toBe(true);
    expect(images.every(i => !/doccia|installazione|demolizione/.test(i.url))).toBe(true);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "bagni", t.pdf_blocchi);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.voci.every(v => v.testo && v.testo.length > 20)).toBe(true);
    }
    expect(leggiBlocco("compreso", "bagni", t.pdf_blocchi).escluse).toHaveLength(2);
    expect(t.faq.some(f => f.domanda.includes("sospesi") && f.risposta.includes("Non è una semplice sostituzione"))).toBe(true);
    const choices = bgnCopyChoices("sanitari", t);
    expect(choices).toHaveLength(10);
    for (const choice of choices) expect(Object.keys(choice.patch)).toHaveLength(1);
    const preview = buildBgnModulePreview("qa", t, "sanitari");
    expect(preview.progetto.tipo_intervento).toBe("Sanitari e rubinetteria");
    expect(preview.progetto.immobile_superficie_mq).toBeNull();
    expect(preview.progetto.detrazione_pct).toBe(0);
    expect(preview.computo).toHaveLength(7);
    expect(preview.computo.every(r => r.descrizione.startsWith("Dotazioni:"))).toBe(true);
    expect(JSON.stringify(preview.computo)).not.toMatch(/doccia|vasca|impermeabilizzazione/);
    expect(preview.progetto.totale_imponibile).toBe(1800); expect(preview.progetto.totale).toBe(2196);
    const s = storage(), doccia = createFullBgnTemplate(base, "doccia");
    saveLocalBgnTemplate("qa", "doccia", doccia, null, s);
    saveLocalBgnTemplate("qa", "sanitari", t, null, s);
    expect(loadLocalBgnTemplate("qa", "doccia", s)?.template.cover_title).toBe(doccia.cover_title);
    expect(loadLocalBgnTemplate("qa", "sanitari", s)?.template.cover_title).toBe(t.cover_title);
  });
  it("rinnova la doccia esistente senza ereditare opere della vasca o del bagno completo", () => {
    const t = createFullBgnTemplate(base, "doccia");
    expect(t.id).toBe("local-bagni-doccia");
    expect(t.cover_title).toBe("La tua doccia, rinnovata.\nOgni dettaglio conta.");
    expect(t.pdf_blocchi?.modulo_intervento).toBe("doccia");
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.faq).toHaveLength(8); expect(t.percorso).toHaveLength(4);
    expect(t.cronoprogramma).toHaveLength(4); expect(t.garanzie).toHaveLength(4);
    expect(t.esigenze).toHaveLength(3); expect(t.soluzione).toHaveLength(3); expect(t.usp).toHaveLength(3);
    expect(t.gallery_lavori).toEqual([]); expect(t.testimonianze).toEqual([]);
    expect(t.default_detrazione_pct).toBe(0);
    const images = fotoDellaLibreria("bagni", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(4);
    for (const image of images) expect(existsSync(`public${image.url}`)).toBe(true);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "bagni", t.pdf_blocchi);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.voci.every(v => v.testo && v.testo.length > 20)).toBe(true);
    }
    expect(leggiBlocco("compreso", "bagni", t.pdf_blocchi).escluse).toHaveLength(2);
    expect(t.faq.some(f => f.domanda.includes("infiltrazione") && f.risposta.includes("Non si promette"))).toBe(true);
    const choices = bgnCopyChoices("doccia", t);
    expect(choices).toHaveLength(10);
    for (const choice of choices) expect(Object.keys(choice.patch)).toHaveLength(1);
    expect(JSON.stringify(choices)).not.toContain("Rimozione vasca");
    const preview = buildBgnModulePreview("qa", t, "doccia");
    expect(preview.progetto.tipo_intervento).toBe("Rifacimento zona doccia");
    expect(preview.progetto.immobile_superficie_mq).toBeNull();
    expect(preview.progetto.detrazione_pct).toBe(0); expect(preview.progetto.accessibile).toBe(false);
    expect(preview.computo).toHaveLength(8);
    expect(preview.computo.every(r => r.descrizione.startsWith("Zona doccia:"))).toBe(true);
    expect(JSON.stringify(preview.computo)).not.toContain("vasca");
    expect(preview.progetto.totale_imponibile).toBe(3600); expect(preview.progetto.totale).toBe(4392);
    const s = storage();
    const vasca = createFullBgnTemplate(base, "vasca-doccia");
    saveLocalBgnTemplate("qa", "completo", make(), null, s);
    saveLocalBgnTemplate("qa", "vasca-doccia", vasca, null, s);
    saveLocalBgnTemplate("qa", "doccia", t, null, s);
    expect(loadLocalBgnTemplate("qa", "completo", s)?.template.cover_title).toBe(make().cover_title);
    expect(loadLocalBgnTemplate("qa", "vasca-doccia", s)?.template.cover_title).toBe(vasca.cover_title);
    expect(loadLocalBgnTemplate("qa", "doccia", s)?.template.cover_title).toBe(t.cover_title);
  });
  it("mantiene Da vasca a doccia distinto dal rifacimento completo", () => {
    const t = createFullBgnTemplate(base, "vasca-doccia");
    expect(t.id).toBe("local-bagni-vasca-doccia");
    expect(t.cover_title).toBe("Dalla vasca alla doccia.\nPiù spazio al quotidiano.");
    expect(t.pdf_blocchi?.modulo_intervento).toBe("vasca-doccia");
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.faq).toHaveLength(8); expect(t.percorso).toHaveLength(4);
    expect(t.cronoprogramma).toHaveLength(4); expect(t.garanzie).toHaveLength(4);
    expect(t.esigenze).toHaveLength(3); expect(t.soluzione).toHaveLength(3);
    expect(t.testimonianze).toEqual([]); expect(t.default_detrazione_pct).toBe(0);
    const images = fotoDellaLibreria("bagni", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const i of images) expect(existsSync(`public${i.url}`)).toBe(true);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "bagni", t.pdf_blocchi);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.voci.every(v => v.testo && v.testo.length > 20)).toBe(true);
    }
    expect(leggiBlocco("compreso", "bagni", t.pdf_blocchi).escluse).toHaveLength(2);
    expect(t.faq.some(f => f.domanda.includes("filo pavimento") && f.risposta.includes("Non è una condizione automatica"))).toBe(true);
    expect(t.faq.some(f => f.domanda.includes("accessibile") && f.risposta.includes("non equivale"))).toBe(true);
    const choices = bgnCopyChoices("vasca-doccia", t);
    expect(choices).toHaveLength(10);
    for (const c of choices) expect(Object.keys(c.patch)).toHaveLength(1);
    expect(JSON.stringify(choices)).not.toContain("Il tuo bagno, dalle predisposizioni");
    const p = buildBgnModulePreview("qa", t, "vasca-doccia");
    expect(p.progetto.immobile_superficie_mq).toBeNull();
    expect(p.progetto.detrazione_pct).toBe(0); expect(p.progetto.accessibile).toBe(false);
    expect(p.progetto.tipo_intervento).toBe("Da vasca a doccia");
    expect(p.computo).toHaveLength(7);
    expect(p.computo.every(r => r.descrizione.startsWith("Zona vasca:"))).toBe(true);
    expect(p.progetto.totale_imponibile).toBe(3470);
    expect(p.progetto.totale).toBe(4233.4);
    const s = storage();
    saveLocalBgnTemplate("qa", "completo", make(), null, s);
    saveLocalBgnTemplate("qa", "vasca-doccia", t, null, s);
    expect(loadLocalBgnTemplate("qa", "completo", s)?.template.cover_title).toBe(make().cover_title);
    expect(loadLocalBgnTemplate("qa", "vasca-doccia", s)?.template.cover_title).toBe(t.cover_title);
  });
  it("ha contenuti specifici, tutte le pagine e immagini locali selezionate", () => {
    const t = make();
    expect(t.pdf_ordine_capitoli?.every(p => p.visibile)).toBe(true);
    expect(t.faq).toHaveLength(8); expect(t.percorso).toHaveLength(4);
    expect(t.cronoprogramma).toHaveLength(4); expect(t.garanzie).toHaveLength(4);
    expect(t.esigenze).toHaveLength(3); expect(t.soluzione).toHaveLength(3);
    expect(t.gallery_lavori).toEqual([]); expect(t.testimonianze).toEqual([]);
    expect(t.default_detrazione_pct).toBe(0); expect(t.condizioni_legali_attivo).toBe(false);
    const images = fotoDellaLibreria("bagni", t.pdf_blocchi);
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const i of images) expect(existsSync(`public${i.url}`)).toBe(true);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "bagni", t.pdf_blocchi);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.voci.every(v => v.testo && v.testo.length > 20)).toBe(true);
    }
    expect(leggiBlocco("compreso", "bagni", t.pdf_blocchi).escluse).toHaveLength(2);
    expect(leggiFotoPagina("investimento", "bagni", t.pdf_blocchi)).toBeNull();
    expect(leggiFotoPagina("chiusura", "bagni", t.pdf_blocchi)).toBeTruthy();
    for (const key of ["computo", "compreso", "percorso", "tempi", "chiSiamo", "garanzie", "domande"] as const)
      expect(leggiFotoPagina(key, "bagni", t.pdf_blocchi)).toBeNull();
    expect(base.id).toBe("online");
  });
  it("offre dieci testi a campo singolo e usa un solo esempio economico", () => {
    const t = make(), choices = bgnCopyChoices("completo", t);
    expect(choices).toHaveLength(10);
    expect(new Set(choices.map(c => c.id)).size).toBe(10);
    for (const c of choices) expect(Object.keys(c.patch)).toHaveLength(1);
    const p = buildBgnModulePreview("qa", t, "completo");
    expect(p.computo).toHaveLength(8); expect(p.progetto.detrazione_pct).toBe(0);
    expect(p.progetto.totale_imponibile).toBe(8090);
    expect(p.progetto.totale).toBe(9869.8);
    expect(t.pdf_cover_hero).toBeNull();
  });
  it("salva e rilegge la stessa copia senza modificare la bozza precedente", () => {
    const s = storage(); s.setItem("vecchia-bozza", "conservata");
    const record = saveLocalBgnTemplate("qa", "completo", make(), null, s);
    expect(loadLocalBgnTemplate("qa", "completo", s)).toEqual(record);
    expect(loadLocalBgnTemplate("altra-azienda", "completo", s)).toBeNull();
    expect(s.getItem("vecchia-bozza")).toBe("conservata");
  });
  it("blocca schede obsolete e conserva il record corrente", () => {
    const s = storage(), first = saveLocalBgnTemplate("qa", "completo", make(), null, s);
    const second = saveLocalBgnTemplate("qa", "completo", { ...make(), cover_title: "Personalizzato" }, first.savedAt, s);
    expect(() => saveLocalBgnTemplate("qa", "completo", make(), first.savedAt, s)).toThrow("altra scheda");
    expect(loadLocalBgnTemplate("qa", "completo", s)).toEqual(second);
  });
  it("non sovrascrive dati corrotti o di un'altra azienda", () => {
    const s = storage(), key = localBgnTemplateKey("qa", "completo");
    s.setItem(key, "{");
    expect(() => saveLocalBgnTemplate("qa", "completo", make(), null, s)).toThrow();
    expect(s.getItem(key)).toBe("{");
    s.setItem(key, JSON.stringify({ version: 1, companyId: "altra", moduleId: "completo", savedAt: new Date().toISOString(), template: make() }));
    expect(() => loadLocalBgnTemplate("qa", "completo", s)).toThrow();
  });
  it("segnala la quota senza falsi successi", () => {
    expect(() => saveLocalBgnTemplate("qa", "completo", make(), null, { getItem: () => null, setItem: () => { throw new Error("quota"); } })).toThrow("spazio esaurito");
  });
});
