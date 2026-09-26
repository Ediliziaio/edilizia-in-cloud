import { describe, expect, it, vi } from "vitest";
import { makeTetQuoteModel, readTetQuoteModel, resolveTetQuoteTemplate } from "@/lib/tetti/quoteModel";
import { TETTI_TEMPLATE_MODULES } from "@/lib/moduli-vendita/tettiTemplateModules";
import { createFullTettiTemplate } from "@/lib/moduli-vendita/fullTettiModules";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import { quoteBuilder } from "@/lib/moduli-vendita/quoteBuilders";
import type { TetTemplatePdf } from "@/types/tetti";

const base = { id: "online", company_id: "company-a", logo_url: "/brand.png", default_iva_pct: 22 } as TetTemplatePdf;
describe("Tetti: identità persistente dell'intervento", () => {
  it.each(TETTI_TEMPLATE_MODULES)("conserva il PDF specifico $id senza dati dimostrativi", model => {
    const source = createFullTettiTemplate(base, model.id);
    const original = structuredClone(source);
    const snapshot = makeTetQuoteModel(base.company_id, model.id, source);
    expect(readTetQuoteModel(JSON.parse(JSON.stringify(snapshot)), base.company_id)?.modelId).toBe(model.id);
    expect(snapshot.template.pdf_blocchi?.modulo_defaults).toBeUndefined();
    expect(snapshot.template.pdf_blocchi?.modulo_foto).toBeUndefined();
    expect(source).toEqual(original);
    snapshot.template.cover_title = "Personalizzato";
    expect(source.cover_title).not.toBe("Personalizzato");
  });
  it("riapre il modello salvato anche se il template aziendale è cambiato", async () => {
    const snapshot = makeTetQuoteModel(base.company_id, "ripasso", createFullTettiTemplate(base, "ripasso"));
    const load = vi.fn(async () => base);
    const template = await resolveTetQuoteTemplate({ company_id: base.company_id, modello_snapshot: snapshot }, base, load);
    expect(template).toBe(snapshot.template);
    expect(load).not.toHaveBeenCalled();
  });
  it("mantiene il comportamento dei preventivi precedenti senza modello", async () => {
    const load = vi.fn(async () => base);
    expect(await resolveTetQuoteTemplate({ company_id: base.company_id }, undefined, load)).toBe(base);
    expect(load).toHaveBeenCalledWith(base.company_id);
    expect(readTetQuoteModel(null, base.company_id)).toBeNull();
  });
  it.each(["companyId", "modelId", "version", "capturedAt", "cover", "order", "templateCompany", "blockId"])("rifiuta un modello incoerente: %s", field => {
    const snapshot = makeTetQuoteModel(base.company_id, "ripasso", createFullTettiTemplate(base, "ripasso"));
    const bad = JSON.parse(JSON.stringify(snapshot));
    if (field === "cover") bad.template.cover_title = "";
    else if (field === "order") bad.template.pdf_ordine_capitoli = [];
    else if (field === "templateCompany") bad.template.company_id = "other";
    else if (field === "blockId") bad.template.pdf_blocchi.modulo_intervento = "rifacimento";
    else bad[field] = "invalid";
    expect(() => readTetQuoteModel(bad, base.company_id)).toThrow();
  });
});
describe("registro unico dei preventivatori", () => {
  it("non usa mai un editor PDF come destinazione operativa", () => {
    const connected = [];
    for (const area of SALES_AREAS) for (const item of area.interventions) {
      const builder = quoteBuilder(area, item);
      if (builder?.connected) {
        connected.push(builder);
        expect(builder.path).toMatch(/\/nuovo$/);
        expect(builder.path).not.toContain("impostazioni");
        expect(builder.modelId).toBe(item.id);
      }
    }
    // Tetti 6, Serramenti 7 e, dal 25/09/2026, tutti gli interventi dei sette
    // preventivatori edili (lib/moduli/modelloPreventivo: 6+6+7+10+6+6+5, con
    // Conto Termico e Casa Full Electric nel Termoidraulico) e i cinque del
    // Fotovoltaico. Fuori solo le Facciate, senza preventivatore.
    expect(connected).toHaveLength(64);
    expect(connected.filter(b => b.engine === "tetti")).toHaveLength(6);
    expect(connected.filter(b => b.engine === "serramenti")).toHaveLength(7);
    expect(connected.filter(b => b.engine === "fotovoltaico")).toHaveLength(5);
  });
  it("non accetta interventi di un'altra area", () => {
    expect(quoteBuilder(SALES_AREAS[0], SALES_AREAS[1].interventions[0])).toBeNull();
  });
});
