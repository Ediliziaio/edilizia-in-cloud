import { beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ remote: vi.fn(() => { throw new Error("Remote forbidden"); }), image: vi.fn(async (url: string | null) => url ? "data:image/jpeg;base64,local" : null) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: calls.remote, storage: { from: calls.remote } } }));
vi.mock("@/hooks/useElettricoProgetto", () => ({ getEleTemplatePdf: calls.remote }));
vi.mock("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: calls.remote }));
vi.mock("@/lib/storage/fileRiservati", () => ({ linkFileRiservati: calls.remote, eRiferimentoNudo: () => false }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: calls.image }));
import { enrichElettricoPdf } from "@/hooks/useElettricoPDF";
import { buildEltModulePreview, createFullEltTemplate, FULL_ELT_MODULES } from "@/lib/moduli-vendita/fullEltModules";
import type { EleTemplatePdf } from "@/types/elettrico";
beforeEach(() => vi.clearAllMocks());
describe("ELETTRICO PDF: confine locale e calcoli originali", () => {
  it.each(FULL_ELT_MODULES)("%s arricchisce senza DB, recensioni o firma URL", async id => {
    const template = createFullEltTemplate({ id: "base", company_id: "demo" } as EleTemplatePdf, id);
    const payload = buildEltModulePreview("demo", template, id);
    const enriched = await enrichElettricoPdf(payload);
    expect(calls.remote).not.toHaveBeenCalled();
    expect(enriched.totali.detrazioneEur).toBe(0);
    expect(enriched.totali.totale).toBeCloseTo(payload.computo.reduce((sum, v) => sum + v.importo, 0) * 1.22, 2);
    const raw = enriched.template as unknown as Record<string, unknown>;
    expect(raw.pdf_voti_online).toEqual([]);
    expect(raw.pdf_blocchi_foto).toHaveProperty("controlli");
    expect(raw.pdf_pagine_foto).toHaveProperty("chiusura", "data:image/jpeg;base64,local");
  });
  it("mantiene sconto integrale e prezzo manuale nel renderer originale", async () => {
    const t = createFullEltTemplate({ company_id: "demo" } as EleTemplatePdf, "ricarica");
    const p = buildEltModulePreview("demo", t, "ricarica");
    p.progetto.sconto_pct = 100;
    expect((await enrichElettricoPdf(p)).totali.totale).toBe(0);
    p.progetto.prezzo_manuale = 1000; p.progetto.sconto_pct = 10;
    expect((await enrichElettricoPdf(p)).totali.totale).toBe(1098);
  });
});
