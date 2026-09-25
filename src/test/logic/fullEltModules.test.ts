import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { buildEltModulePreview, createFullEltTemplate, FULL_ELT_MODULES, ELT_MODULE_TITLES, ELT_MODULE_COVERS } from "@/lib/moduli-vendita/fullEltModules";
import { eltCopyChoices } from "@/lib/moduli-vendita/eltInterventionCopy";
import { loadLocalEltTemplate, saveLocalEltTemplate, localEltTemplateKey } from "@/lib/moduli-vendita/localEltTemplates";
import { leggiBlocco, leggiFotoPagina, RIEMPIMENTI_EDILI } from "../../../supabase/functions/_shared/blocchiPreventivo";
import type { EleTemplatePdf } from "@/types/elettrico";

const base = { id: "online", company_id: "demo", ragione_sociale: "Azienda", default_detrazione_pct: 50, chi_siamo: "La nostra azienda" } as EleTemplatePdf;
function storageFixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  return { values, storage };
}

describe("ELETTRICO: sette moduli originali indipendenti", () => {
  it.each(FULL_ELT_MODULES)("%s usa testi, foto effettive e un progetto del mestiere", id => {
    const model = createFullEltTemplate(base, id);
    expect(model.id).toBe(`local-elettrico-${id}`);
    expect(model.company_id).toBe("demo"); expect(model.ragione_sociale).toBe("Azienda");
    expect(model.cover_image_url).toBe(ELT_MODULE_COVERS[id]);
    expect(model.faq).toHaveLength(8); expect(model.cronoprogramma).toHaveLength(4);
    expect(model.testimonianze).toEqual([]); expect(model.gallery_lavori).toEqual([]);
    expect(model.default_detrazione_pct).toBe(0); expect(model.finanziamento_promo).toBeNull();
    expect(model.pdf_pagine_libere).toEqual([]);
    const pictures = new Set<string>();
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "elettrico", model.pdf_blocchi);
      expect(block.foto.length, key).toBeGreaterThan(0);
      expect(block.voci.length, key).toBeGreaterThanOrEqual(3);
      expect(block.intro.length, key).toBeGreaterThan(40);
      block.foto.forEach(photo => { expect(existsSync(`public${photo}`)).toBe(true); pictures.add(photo); });
    }
    for (const key of [...Object.values(RIEMPIMENTI_EDILI).filter(k => k !== "recensioni"), "chiusura"] as const) {
      const photo = leggiFotoPagina(key, "elettrico", model.pdf_blocchi);
      expect(photo, key).toBeTruthy(); expect(existsSync(`public${photo}`)).toBe(true);
    }
    expect(pictures.size).toBeGreaterThanOrEqual(4);
    for (const key of ["chiusura", "investimento", "garanzie", "domande", "tempi", "computo"] as const) {
      expect(pictures.has(leggiFotoPagina(key, "elettrico", model.pdf_blocchi)!), `${key}: il renderer scarta le foto già usate nei blocchi`).toBe(false);
    }
    expect(eltCopyChoices(id, model)).toHaveLength(10);
    const preview = buildEltModulePreview("demo", model, id);
    expect(preview.localOnly).toBe(true); expect(preview.media).toEqual([]);
    expect(preview.progetto.tipo_intervento).toBe(ELT_MODULE_TITLES[id]);
    expect(preview.progetto.detrazione_pct).toBe(0); expect(preview.progetto.mostra_finanziamento).toBe(false);
    expect(preview.progetto.numero_punti).toBeNull(); expect(preview.progetto.livello_impianto).toBeNull();
    expect(preview.progetto.immobile_superficie_mq).toBeNull();
    expect(preview.computo).toHaveLength(3);
    expect(JSON.stringify(preview.computo)).not.toMatch(/tramezzi|idraulico|pavimento|gres|cartongesso/);
    expect(base.id).toBe("online"); expect(base.default_detrazione_pct).toBe(50);
  });
  it("ogni intervento ha copy e computo distinti e lo stato non è condiviso", () => {
    const models = FULL_ELT_MODULES.map(id => createFullEltTemplate(base, id));
    expect(new Set(models.map(t => t.cover_title)).size).toBe(7);
    expect(new Set(models.map(t => JSON.stringify(t.faq))).size).toBe(7);
    const a = createFullEltTemplate(base, "quadro"), b = createFullEltTemplate(base, "quadro");
    a.faq[0].risposta = "Modifica locale";
    expect(b.faq[0].risposta).not.toBe(a.faq[0].risposta);
  });
  it("separa aziende e interventi, rifiuta conflitti di revisione", () => {
    const { storage } = storageFixture(); const template = createFullEltTemplate(base, "quadro");
    const saved = saveLocalEltTemplate("demo", "quadro", template, null, storage);
    expect(loadLocalEltTemplate("demo", "quadro", storage)?.template).toEqual(template);
    expect(loadLocalEltTemplate("altra", "quadro", storage)).toBeNull();
    expect(loadLocalEltTemplate("demo", "ricarica", storage)).toBeNull();
    expect(() => saveLocalEltTemplate("demo", "quadro", template, null, storage)).toThrow("altra scheda");
    expect(() => saveLocalEltTemplate("altra", "quadro", template, saved.savedAt, storage)).toThrow("altra azienda");
    expect(() => saveLocalEltTemplate("demo", "ricarica", template, null, storage)).toThrow("non è leggibile");
    const again = saveLocalEltTemplate("demo", "quadro", template, saved.savedAt, storage);
    expect(Date.parse(again.savedAt)).toBeGreaterThan(Date.parse(saved.savedAt));
  });
  it("non sovrascrive copie danneggiate e segnala il limite del browser", () => {
    const { storage, values } = storageFixture(); const key = localEltTemplateKey("demo", "punti");
    values.set(key, "{broken");
    const template = createFullEltTemplate(base, "punti");
    expect(() => saveLocalEltTemplate("demo", "punti", template, null, storage)).toThrow("danneggiata");
    expect(values.get(key)).toBe("{broken");
    const blocked = { getItem: (): null => null, setItem: () => { throw new DOMException("Quota", "QuotaExceededError"); } };
    expect(() => saveLocalEltTemplate("demo", "punti", template, null, blocked)).toThrow("spazio esaurito");
  });
});
