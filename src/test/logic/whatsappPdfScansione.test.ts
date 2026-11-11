import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  ai: vi.fn(),
  download: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock(
  "../../../supabase/functions/_shared/ddtWhatsappPersistente.ts",
  () => ({
    acquisisciDdtWhatsapp: vi
      .fn()
      .mockResolvedValue({ id: "job", status: "review" }),
  }),
);
vi.mock("../../../supabase/functions/_shared/aiRouter.ts", () => ({
  aiRouterComplete: m.ai,
}));
vi.mock("../../../supabase/functions/whatsapp-ai-processor/openai.ts", () => ({
  callOpenAI: vi.fn(),
  transcribeAudioWhisper: vi.fn(),
}));
vi.mock("../../../supabase/functions/_shared/resolveWhatsAppSender.ts", () => ({
  resolveWhatsAppSender: vi.fn(),
}));
import { leggiDocumentoOperativo } from "../../../supabase/functions/whatsapp-ai-processor/media";
const opts = {
  storagePath: "azienda/2026-11/prova.pdf",
  companyId: "azienda",
  userId: "utente",
  didascalia: "Bolla del cemento",
  messageId: "messaggio",
  mime: "application/pdf",
};
const db = {
  storage: { from: () => ({ download: m.download }) },
} as unknown as Parameters<typeof leggiDocumentoOperativo>[0];
beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: () => "https://progetto.invalid" } });
  vi.stubGlobal("fetch", m.fetch);
  m.fetch
    .mockReset()
    .mockResolvedValue({ ok: true, json: async () => ({ text: "" }) });
  m.download
    .mockReset()
    .mockResolvedValue({
      data: {
        size: 9,
        arrayBuffer: async () => new TextEncoder().encode("%PDF-test").buffer,
      },
      error: null,
    });
  m.ai
    .mockReset()
    .mockResolvedValue({
      content: JSON.stringify({
        document_type: "ddt",
        supplier_name: "Fornitore prova",
        ddt_number: "DDT/42",
        items: [{ description: "Cemento", quantity: 12.5, unit: "kg" }],
        confidenza_estrazione: "media",
      }),
    });
});
afterEach(() => vi.unstubAllGlobals());
describe("PDF scansionato ricevuto su WhatsApp", () => {
  it("usa la visione quando la scansione non ha testo e conserva righe e decimali", async () => {
    const result = await leggiDocumentoOperativo(db, opts);
    expect(result).toContain("Fornitore prova");
    expect(result).toContain("DDT/42");
    expect(result).toContain("12,5 kg");
    expect(m.ai).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "azienda",
        userId: "utente",
        taskKey: "pdf_vision_extract",
        idempotencyKey: "wa_ddt_pdf_azienda_messaggio",
      }),
    );
    const call = m.ai.mock.calls[0][0];
    expect(call.messages[1].content[1]).toMatchObject({
      type: "file",
      file: {
        filename: "documento-whatsapp.pdf",
        file_data: expect.stringContaining("data:application/pdf;base64,"),
      },
    });
  });
  it("un PDF con testo leggibile non provoca una seconda lettura AI", async () => {
    m.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "DOCUMENTO DI TRASPORTO numero 42 Fornitore prova Cemento 12 kg",
      }),
    });
    expect(await leggiDocumentoOperativo(db, opts)).toContain("Cemento 12 kg");
    expect(m.ai).not.toHaveBeenCalled();
    expect(m.download).not.toHaveBeenCalled();
  });
  it("mantiene un errore recuperabile senza inventare dati se la visione fallisce", async () => {
    m.ai.mockRejectedValue(new Error("OCR non disponibile"));
    expect(await leggiDocumentoOperativo(db, opts)).toContain(
      "non sono riuscito a leggerlo",
    );
  });
  it("non manda al modello un allegato oltre il limite", async () => {
    m.download.mockResolvedValue({
      data: { size: 19 * 1024 * 1024 },
      error: null,
    });
    expect(await leggiDocumentoOperativo(db, opts)).toContain(
      "non sono riuscito a leggerlo",
    );
    expect(m.ai).not.toHaveBeenCalled();
  });
});
