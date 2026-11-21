import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  ai: vi.fn(),
  acquisisci: vi.fn(),
  download: vi.fn(),
  fetch: vi.fn(),
  visioneBreve: vi.fn(),
}));
vi.mock(
  "../../../supabase/functions/_shared/ddtWhatsappPersistente.ts",
  () => ({
    acquisisciDdtWhatsapp: m.acquisisci,
  }),
);
vi.mock("../../../supabase/functions/_shared/aiRouter.ts", () => ({
  aiRouterComplete: m.ai,
}));
vi.mock("../../../supabase/functions/whatsapp-ai-processor/openai.ts", () => ({
  callOpenAI: m.visioneBreve,
  transcribeAudioWhisper: vi.fn(),
}));
vi.mock("../../../supabase/functions/_shared/resolveWhatsAppSender.ts", () => ({
  resolveWhatsAppSender: vi.fn(),
}));
import { leggiDocumentoOperativo, leggiFotoOperativa } from "../../../supabase/functions/whatsapp-ai-processor/media";
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
  m.acquisisci.mockReset().mockResolvedValue({ id: "job", status: "queued", stessoOperatore: true });
  m.visioneBreve.mockReset().mockResolvedValue({ choices: [{ message: { content: "DDT\nFornitore prova" } }] });
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
    const result = await leggiDocumentoOperativo(db, { ...opts, didascalia: null });
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
    expect(await leggiDocumentoOperativo(db, { ...opts, didascalia: null })).toContain("Cemento 12 kg");
    expect(m.ai).not.toHaveBeenCalled();
    expect(m.acquisisci).toHaveBeenLastCalledWith(db, expect.objectContaining({ accodaLettura: true }));
  });
  it("accoda direttamente la bolla dichiarata e restituisce la conferma senza aspettare il lettore", async () => {
    m.ai.mockRejectedValue(new Error("OCR non disponibile"));
    expect(await leggiDocumentoOperativo(db, opts)).toContain("DDT da leggere");
    expect(m.acquisisci).toHaveBeenCalledExactlyOnceWith(db, expect.objectContaining({ accodaLettura: true }));
    expect(m.ai).not.toHaveBeenCalled();
    expect(m.fetch).not.toHaveBeenCalled();
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
    expect(m.acquisisci).not.toHaveBeenCalled();
  });
});

it("riconosce la foto di una bolla senza didascalia e mette l'originale in coda", async () => {
  const ricordaBolla = vi.fn();
  const file = new Blob([new Uint8Array([255, 216, 255, 1])], { type: "image/jpeg" });
  m.download.mockResolvedValue({ data: file, error: null });
  m.ai.mockRejectedValue(new Error("OCR non disponibile"));
  const testo = await leggiFotoOperativa(db, { ...opts, storagePath: "azienda/2026-11/ddt.jpg", didascalia: null, ricordaBolla });
  expect(testo).toContain("Foto di un DDT — da leggere");
  expect(m.visioneBreve).toHaveBeenCalledTimes(1);
  expect(m.acquisisci).toHaveBeenCalledExactlyOnceWith(db, expect.objectContaining({ file, accodaLettura: true }));
  expect(m.ai).not.toHaveBeenCalled();
  expect(ricordaBolla).toHaveBeenCalledExactlyOnceWith("job", "queued");
});
