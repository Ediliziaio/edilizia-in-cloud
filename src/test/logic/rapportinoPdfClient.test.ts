import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ invoke: vi.fn(), sign: vi.fn(), loading: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: m.invoke } } }));
vi.mock("@/lib/storage/fileRiservati", () => ({ linkFileRiservato: m.sign }));
vi.mock("sonner", () => ({ toast: m }));
import { notifyRapportinoPdf, openRapportinoPdf, requestRapportinoPdf } from "@/lib/campo/rapportinoPdf";
import type { QueryClient } from "@tanstack/react-query";
const qc = { invalidateQueries: m.invalidate } as unknown as QueryClient;
beforeEach(() => { vi.clearAllMocks(); m.invalidate.mockResolvedValue(undefined); });
describe("generazione senza perdita del rapportino", () => {
  it("gestisce error risolto, non solo promise rejected", async () => {
    m.invoke.mockResolvedValue({ data: null, error: { message: "server" } });
    expect(await notifyRapportinoPdf("a", "order", qc)).toBeNull();
    expect(m.error).toHaveBeenCalledWith("Rapportino salvato, PDF da generare", expect.objectContaining({ action: expect.objectContaining({ label: "Riprova PDF" }) }));
    expect(m.success).not.toHaveBeenCalled();
  });
  it("non annuncia pronto senza URL", async () => { m.invoke.mockResolvedValue({ data: {}, error: null }); await expect(requestRapportinoPdf("b")).rejects.toThrow("PDF non disponibile"); });
  it("aggiorna cache campo e azienda e annuncia pronto", async () => {
    m.invoke.mockResolvedValue({ data: { pdf_url: "https://local.invalid/x.pdf" }, error: null });
    await notifyRapportinoPdf("c", "order", qc);
    expect(m.success).toHaveBeenCalled(); expect(m.invalidate).toHaveBeenCalledTimes(2);
  });
  it("allegati mancanti sono avvertenze visibili", async () => {
    m.invoke.mockResolvedValue({ data: { pdf_url: "https://local.invalid/x.pdf", warnings: ["Foto 2 assente"] }, error: null });
    await notifyRapportinoPdf("d", "order", qc); expect(m.warning).toHaveBeenCalled(); expect(m.success).not.toHaveBeenCalled();
  });
  it("deduplica richieste simultanee, ma permette riprovare", async () => {
    let resolve!: (v: unknown) => void;
    m.invoke.mockReturnValue(new Promise(r => { resolve = r; }));
    const a = requestRapportinoPdf("e"), b = requestRapportinoPdf("e");
    expect(a).toBe(b); expect(m.invoke).toHaveBeenCalledTimes(1);
    resolve({ data: { pdf_url: "url" } }); await a;
    m.invoke.mockResolvedValue({ data: { pdf_url: "url2" } }); await requestRapportinoPdf("e"); expect(m.invoke).toHaveBeenCalledTimes(2);
  });
});
describe("apertura da un tap mobile", () => {
  it("riserva la scheda prima della chiamata asincrona", async () => {
    const tab = { document: { title: "", body: { textContent: "" } }, opener: {}, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    m.invoke.mockImplementation(async () => { expect(open).toHaveBeenCalled(); return { data: { pdf_url: "https://local.invalid/new.pdf" } }; });
    m.sign.mockResolvedValue("https://local.invalid/signed.pdf");
    await openRapportinoPdf({ id: "f" }, "order", qc);
    expect(tab.opener).toBeNull(); expect(tab.location.replace).toHaveBeenCalledWith("https://local.invalid/signed.pdf"); open.mockRestore();
  });
  it("non apre un vecchio URL pubblico se la firma fallisce", async () => {
    const tab = { document: { title: "", body: { textContent: "" } }, opener: {}, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const url = "https://local.invalid/storage/v1/object/public/campo-rapportini/c/r/rapportino-v2-x.pdf";
    m.sign.mockResolvedValue(url);
    await expect(openRapportinoPdf({ id: "g", pdf_url: url }, "order", qc)).rejects.toThrow("file riservato");
    expect(tab.close).toHaveBeenCalled(); expect(tab.location.replace).not.toHaveBeenCalled(); open.mockRestore();
  });
});
