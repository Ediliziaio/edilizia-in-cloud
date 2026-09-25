import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { makeSrQuoteModelSnapshot, quoteModelTemplate, SR_OPERATIONAL_MODELS } from "@/lib/serramenti/quoteModel";

const db = vi.hoisted(() => ({ project: null as Record<string, unknown> | null, insert: vi.fn(), update: vi.fn(), missingColumn: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: "user-A" } } }) },
  from: (table: string) => {
    let insertValue: Record<string, unknown> | null = null;
    const result = () => ({ data: table === "sr_template_pdf" ? { iva_percentuale_default: 10, valido_giorni_default: 15, anticipo_pct_default: 40 }
      : table === "sr_progetti" ? db.project : [] as never[], error: null as null });
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain,
      insert: (value: Record<string, unknown>) => { insertValue = value; db.insert(value); return chain; },
      update: (value: Record<string, unknown>) => { db.update(value); return chain; },
      maybeSingle: async () => result(),
      single: async () => {
        if (db.missingColumn && insertValue?.modello_snapshot) return { data: null as null, error: { code: "42703" } };
        db.project = { ...JSON.parse(JSON.stringify(insertValue)), id: "new-quote", code: "SR-TEST" };
        return result();
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  },
} }));
import { createProgetto, getProgetto, updateProgetto, generaPdf } from "@/lib/serramenti/api";

beforeEach(() => { vi.clearAllMocks(); db.project = null; db.missingColumn = false; });
describe("quote model persistence contract (mocked database)", () => {
  it.each(SR_OPERATIONAL_MODELS)("creates and reopens %s with the exact document, without URL/localStorage", async modelId => {
    const source = createFullSerramentiTemplate({ company_id: "A" }, modelId);
    source.pdf_cover_hero = `Offerta ${modelId} personalizzata`;
    const modello_snapshot = makeSrQuoteModelSnapshot("A", modelId, source);
    const created = await createProgetto({ cliente_nome: "Cliente reale", opportunita_id: "opportunity-A", modello_snapshot }, "A");
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.project).toMatchObject({ company_id: "A", cliente_nome: "Cliente reale", opportunita_id: "opportunity-A", iva_percentuale: 10, fin_anticipo_pct: 40 });
    expect(db.project).not.toHaveProperty("totale_min");
    source.pdf_cover_hero = "Testo modificato dopo la creazione";
    modello_snapshot.template.pdf_cover_hero = "Altra modifica locale";
    const reopened = await getProgetto(created.id);
    expect(quoteModelTemplate(reopened.progetto)?.pdf_cover_hero).toBe(`Offerta ${modelId} personalizzata`);
    expect(reopened.serramenti).toEqual([]); // Never insert preview/sample products.
    expect(reopened.progetto.esigenze.length).toBeGreaterThan(0);
  });
  it("legacy creation omits the new column entirely", async () => {
    db.missingColumn = true;
    await createProgetto({ cliente_nome: "Legacy" }, "A");
    expect(db.project).not.toHaveProperty("modello_snapshot");
  });
  it("rejects tenant mismatch before INSERT", async () => {
    const snapshot = makeSrQuoteModelSnapshot("B", "finestre", createFullSerramentiTemplate({ company_id: "B" }, "finestre"));
    await expect(createProgetto({ modello_snapshot: snapshot }, "A")).rejects.toThrow(/non è valido/);
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("does not retry with a generic model when the column is unavailable", async () => {
    db.missingColumn = true;
    const snapshot = makeSrQuoteModelSnapshot("A", "finestre", createFullSerramentiTemplate({ company_id: "A" }, "finestre"));
    await expect(createProgetto({ modello_snapshot: snapshot }, "A")).rejects.toThrow(/Creazione/);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.project).toBeNull();
  });
  it("ordinary autosave cannot replace the captured document", async () => {
    await updateProgetto("quote", { cliente_nome: "Nome nuovo", modello_snapshot: null as null });
    expect(db.update).toHaveBeenCalledExactlyOnceWith({ cliente_nome: "Nome nuovo" });
  });
  it("blocks the incompatible public-signature renderer before invocation", async () => {
    db.project = { modello_snapshot: makeSrQuoteModelSnapshot("A", "persiane", createFullSerramentiTemplate({ company_id: "A" }, "persiane")) };
    await expect(generaPdf("quote")).rejects.toThrow(/PDF A4/);
  });
});
