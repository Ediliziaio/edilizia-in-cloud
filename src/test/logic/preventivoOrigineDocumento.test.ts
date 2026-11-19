import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { documentoPreventivoOrigine, type PreventivoOrigine } from "@/lib/orders/preventivoOrigineDocumento";
const state = vi.hoisted(() => ({ download: vi.fn(), invoke: vi.fn(), maybeSingle: vi.fn(), from: vi.fn(), storage: vi.fn(), filters: [] as unknown[][] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from, functions: { invoke: state.invoke }, storage: { from: state.storage } } }));
const quote: PreventivoOrigine = { id: "q1", company_id: "azienda1", quote_number: "PRV/1", signed_at: null, firma_modo: null, contratto_firmato: null, pdf_storage_path: "azienda1/preventivo.pdf" };
beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
  vi.clearAllMocks(); state.filters = [];
  state.storage.mockReturnValue({ download: state.download });
  const builder = { select: () => builder, eq: (...args: unknown[]) => { state.filters.push(args); return builder; }, order: () => builder, limit: () => builder, maybeSingle: state.maybeSingle };
  state.from.mockReturnValue(builder);
  state.maybeSingle.mockResolvedValue({ data: null, error: null });
  state.download.mockResolvedValue({ data: new Blob(["%PDF-1.7\noriginale"]), error: null });
});
afterEach(() => vi.unstubAllGlobals());
describe("documento originale del preventivo nella commessa", () => {
  it("scarica il PDF esistente senza duplicarlo o rigenerarlo", async () => {
    const file = await documentoPreventivoOrigine(quote);
    expect(await file.blob.text()).toContain("originale");
    expect(state.storage).toHaveBeenCalledWith("quote-pdfs");
    expect(state.download).toHaveBeenCalledWith(quote.pdf_storage_path);
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it("privilegia la scansione firmata su carta, anche se esiste un PDF semplice", async () => {
    const file = await documentoPreventivoOrigine({ ...quote, firma_modo: "carta", contratto_firmato: { bucket: "order-attachments", path: "azienda1/firmato.jpg", name: "firma.jpg" } });
    expect(file.nomeFile).toBe("firma.jpg");
    expect(state.download).toHaveBeenCalledWith("azienda1/firmato.jpg");
    expect(state.from).not.toHaveBeenCalled(); expect(state.invoke).not.toHaveBeenCalled();
  });
  it("per la firma digitale legge la copia certificata della stessa azienda e preventivo", async () => {
    state.maybeSingle.mockResolvedValue({ data: { id: "firma1" }, error: null });
    state.invoke.mockResolvedValue({ data: { url: "https://example.test/firmato.pdf" }, error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("%PDF-1.7\ncertificato")));
    const file = await documentoPreventivoOrigine({ ...quote, firma_modo: "digitale", signed_at: "2026-11-17" });
    expect(await file.blob.text()).toContain("certificato");
    expect(state.filters).toEqual(expect.arrayContaining([["company_id", "azienda1"], ["quote_id", "q1"], ["status", "signed"]]));
    expect(state.invoke).toHaveBeenCalledWith("fea-pdf-firmato", { body: { request_id: "firma1" } });
    expect(state.download).not.toHaveBeenCalled();
  });
  it("non rigenera e non sostituisce una copia digitale assente", async () => {
    await expect(documentoPreventivoOrigine({ ...quote, firma_modo: "digitale" })).rejects.toThrow("Copia firmata non disponibile");
    expect(state.invoke).not.toHaveBeenCalled(); expect(state.download).not.toHaveBeenCalled();
  });
  it("non rigenera un preventivo accettato se manca il PDF conservato", async () => {
    await expect(documentoPreventivoOrigine({ ...quote, firma_modo: "online", pdf_storage_path: null })).rejects.toThrow("Non viene rigenerato");
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it("non ripiega sul PDF semplice se la scansione firmata non è accessibile", async () => {
    state.download.mockResolvedValueOnce({ data: null, error: { message: "403" } });
    await expect(documentoPreventivoOrigine({ ...quote, contratto_firmato: { bucket: "quote-pdfs", path: "azienda1/firma.pdf", name: "firma.pdf" } })).rejects.toThrow("documento firmato non è disponibile");
    expect(state.download).toHaveBeenCalledTimes(1); expect(state.invoke).not.toHaveBeenCalled();
  });
  it("non usa il PDF semplice quando la verifica della firma fallisce", async () => {
    state.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "403" } });
    await expect(documentoPreventivoOrigine({ ...quote, signed_at: "2026-11-17" })).rejects.toThrow("verificare la copia firmata");
    expect(state.download).not.toHaveBeenCalled(); expect(state.invoke).not.toHaveBeenCalled();
  });
  it("conserva il PDF di un'accettazione precedente senza rigenerarlo", async () => {
    await documentoPreventivoOrigine({ ...quote, signed_at: "2026-11-17", firma_modo: "online" });
    expect(state.download).toHaveBeenCalledWith(quote.pdf_storage_path);
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it("non spaccia errori di accesso e file non PDF per un documento scaricato", async () => {
    state.download.mockResolvedValueOnce({ data: null, error: { message: "403" } });
    await expect(documentoPreventivoOrigine(quote)).rejects.toThrow("non è disponibile");
    state.download.mockResolvedValueOnce({ data: new Blob(["<html>errore</html>"]), error: null });
    await expect(documentoPreventivoOrigine(quote)).rejects.toThrow("non è un PDF valido");
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it("genera un PDF solo quando non ne esiste uno e il preventivo non risulta firmato", async () => {
    state.invoke.mockResolvedValue({ data: { signed_url: "https://example.test/preventivo.pdf" }, error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("%PDF-1.7\nnuovo")));
    await documentoPreventivoOrigine({ ...quote, pdf_storage_path: null });
    expect(state.invoke).toHaveBeenCalledWith("generate-quote-pdf", { body: { quote_id: "q1" } });
  });
});
