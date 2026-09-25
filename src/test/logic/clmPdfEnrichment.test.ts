import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichClimatizzazionePdf } from "@/hooks/useClimatizzazionePDF";
import { buildClmModulePreview, createFullClmTemplate, FULL_CLM_MODULES } from "@/lib/moduli-vendita/fullClmModules";
import type { ClmTemplatePdf } from "@/types/climatizzazione";

const calls = vi.hoisted(() => ({ remote: vi.fn(() => { throw Error("No remote access"); }), image: vi.fn(async () => null), signed: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: calls.remote } }));
vi.mock("@/hooks/useClimatizzazioneProgetto", () => ({ getClmTemplatePdf: calls.remote }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: calls.image }));
vi.mock("@/lib/storage/fileRiservati", () => ({ linkFileRiservati: calls.signed, eRiferimentoNudo: () => false }));
afterEach(() => vi.clearAllMocks());

describe("Climatizzazione local enrichment", () => {
  it.each(FULL_CLM_MODULES)("%s uses real calculation helpers without remote template, reviews or media signing", async id => {
    const template = createFullClmTemplate({ company_id: "qa", id: "base" } as ClmTemplatePdf, id);
    const payload = buildClmModulePreview("qa", template, id);
    const data = await enrichClimatizzazionePdf(payload);
    expect(data.totali.totale).toBe(payload.progetto.totale);
    expect(data.totali.detrazioneEur).toBe(0);
    expect(data.capitoli).toHaveLength(3);
    expect(calls.remote).not.toHaveBeenCalled();
    expect(calls.signed).not.toHaveBeenCalled();
    expect(calls.image).toHaveBeenCalled();
  });
  it("requires an explicit local template", async () => {
    const template = createFullClmTemplate({ company_id: "qa" } as ClmTemplatePdf, "vmc");
    await expect(enrichClimatizzazionePdf({ ...buildClmModulePreview("qa", template, "vmc"), template: null })).rejects.toThrow(/esplicitamente/);
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("handles complete discounts and manual prices in the original enrichment", async () => {
    const template = createFullClmTemplate({ company_id: "qa" } as ClmTemplatePdf, "canalizzato");
    const payload = buildClmModulePreview("qa", template, "canalizzato");
    payload.progetto.sconto_pct = 100;
    expect((await enrichClimatizzazionePdf(payload)).totali.totale).toBe(0);
    Object.assign(payload.progetto, { prezzo_manuale: 1000, sconto_pct: 10 });
    const data = await enrichClimatizzazionePdf(payload);
    expect(data.totali.imponibile).toBe(900);
    expect(data.totali.iva).toBe(198);
    expect(data.totali.totale).toBe(1098);
    expect(data.totali.prezzoManuale).toBe(true);
  });
});
