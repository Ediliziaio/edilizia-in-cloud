import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elaboraFotoDocumento } from "@/lib/campo/leggiDocumentoAcquisto";

const state = vi.hoisted(() => ({ compress: vi.fn(), upload: vi.fn(), invoke: vi.fn() }));
vi.mock("@/lib/campo/compressImage", () => ({ compressImage: state.compress }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ upload: state.upload }) }, functions: { invoke: state.invoke },
} }));

beforeEach(() => {
  state.compress.mockReset().mockResolvedValue(new Blob(["foto"], { type: "image/jpeg" }));
  state.upload.mockReset().mockImplementation(async path => ({ data: { path }, error: null }));
  state.invoke.mockReset().mockResolvedValue({ data: { success: true, ddt: {} }, error: null });
  vi.stubGlobal("FileReader", class {
    result = "data:image/jpeg;base64,Zm90bw==";
    onload: (() => void) | null = null;
    readAsDataURL() { this.onload?.(); }
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:documento");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Foto della bolla: caricamento e lettura indipendenti", () => {
  const failureCases = [false, true].flatMap(compressionError => [false, true].flatMap(uploadError =>
    [false, true].map(aiError => ({ compressionError, uploadError, aiError }))));
  it.each(failureCases)("compressione=$compressionError · deposito=$uploadError · AI=$aiError", async s => {
    if (s.compressionError) state.compress.mockRejectedValueOnce(new Error("Decoder non disponibile"));
    if (s.uploadError) state.upload.mockResolvedValueOnce({ data: null, error: { message: "Deposito non disponibile" } });
    if (s.aiError) state.invoke.mockResolvedValueOnce({ data: null, error: { message: "AI non disponibile" } });
    const result = await elaboraFotoDocumento(new File(["documento"], "bolla.png", { type: "image/png" }), "azienda-test", "commessa-test");
    expect(result.path === null).toBe(s.uploadError); expect(result.lettura === null).toBe(s.aiError);
    expect(state.upload).toHaveBeenCalledTimes(1); expect(state.invoke).toHaveBeenCalledTimes(1);
    expect(state.upload.mock.calls[0][0]).toMatch(/^azienda-test\/commessa-test\/acquisti\//);
    expect(state.invoke.mock.calls[0][1].body).toMatchObject({
      company_id: "azienda-test", mime_type: s.compressionError ? "image/png" : "image/jpeg",
    });
  });
  it("una foto compressa viene inviata come JPEG con un percorso univoco", async () => {
    const f = await elaboraFotoDocumento(new File(["x"], "doc.png", { type: "image/png" }), "company", "site");
    expect(f.path).toMatch(/^company\/site\/acquisti\/.+\.jpg$/);
    expect(state.upload).toHaveBeenCalledWith(expect.any(String), expect.any(Blob), { contentType: "image/jpeg", upsert: false });
    expect(state.invoke).toHaveBeenCalledWith("ddt-ai-extract", { body: expect.objectContaining({ mime_type: "image/jpeg", file_name: "documento.jpg" }) });
  });
  it("se la compressione fallisce il PNG resta PNG, senza dichiararlo falsamente JPEG", async () => {
    state.compress.mockRejectedValueOnce(new Error("Canvas non disponibile"));
    const f = await elaboraFotoDocumento(new File(["x"], "doc.png", { type: "image/png" }), "company", null);
    expect(f.path).toMatch(/^company\/generico\/acquisti\/.+\.png$/);
    expect(state.upload).toHaveBeenCalledWith(expect.any(String), expect.any(File), { contentType: "image/png", upsert: false });
    expect(state.invoke).toHaveBeenCalledWith("ddt-ai-extract", { body: expect.objectContaining({ mime_type: "image/png", file_name: "documento.png" }) });
  });
  it("se il deposito non risponde mantiene la lettura ma non finge che la foto sia allegata", async () => {
    state.upload.mockRejectedValueOnce(new Error("Offline"));
    const f = await elaboraFotoDocumento(new File(["x"], "doc.jpg", { type: "image/jpeg" }), "company", "site");
    expect(f.path).toBeNull(); expect(f.lettura).not.toBeNull();
  });
  it("se l'AI non risponde mantiene il documento e permette la compilazione manuale", async () => {
    state.invoke.mockRejectedValueOnce(new Error("AI non disponibile"));
    const f = await elaboraFotoDocumento(new File(["x"], "doc.jpg", { type: "image/jpeg" }), "company", "site");
    expect(f.path).not.toBeNull(); expect(f.lettura).toBeNull();
  });
  it("rifiuta PDF, file vuoti e foto eccessive prima di generare traffico", async () => {
    for (const file of [new File(["x"], "doc.pdf", { type: "application/pdf" }), new File([], "vuoto.jpg", { type: "image/jpeg" }), new File([new Uint8Array(15 * 1024 * 1024 + 1)], "enorme.jpg", { type: "image/jpeg" })]) {
      await expect(elaboraFotoDocumento(file, "company", "site")).rejects.toThrow();
    }
    expect(state.compress).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled(); expect(state.invoke).not.toHaveBeenCalled();
  });
  it("un HEIC non convertibile non viene caricato come se fosse un JPEG leggibile", async () => {
    state.compress.mockRejectedValueOnce(new Error("Immagine non decodificabile"));
    await expect(elaboraFotoDocumento(new File(["x"], "doc.heic", { type: "image/heic" }), "company", "site")).rejects.toThrow("Questa foto non è leggibile");
    expect(state.upload).not.toHaveBeenCalled(); expect(state.invoke).not.toHaveBeenCalled();
  });
});
