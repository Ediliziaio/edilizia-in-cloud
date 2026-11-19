import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const stato = vi.hoisted(() => ({ worker: {} as unknown, src: "", getDocument: vi.fn(), cleanup: vi.fn(), destroy: vi.fn() }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ get default() { return stato.worker; } }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { get workerSrc() { return stato.src; }, set workerSrc(value: unknown) { if (typeof value !== "string") throw new Error("Invalid workerSrc type"); stato.src = value; } },
  getDocument: stato.getDocument,
}));
import { leggiFileComputo, PdfDaLeggereConAi } from "@/lib/computo/leggiFileComputo";
beforeEach(() => {
  vi.clearAllMocks(); stato.worker = {}; stato.src = "";
  stato.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [] }), cleanup: stato.cleanup }) }), destroy: stato.destroy });
});
afterEach(() => vi.unstubAllEnvs());
const file = () => new File(["%PDF-di-prova"], "computo.pdf", { type: "application/pdf" });
describe("worker del lettore PDF del computo", () => {
  it("legge in locale anche quando Vite restituisce il modulo al posto dell'URL", async () => {
    vi.stubEnv("DEV", true);
    await expect(leggiFileComputo(file())).rejects.toBeInstanceOf(PdfDaLeggereConAi);
    expect(stato.src).toBe("/node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
    expect(stato.getDocument).toHaveBeenCalledOnce(); expect(stato.cleanup).toHaveBeenCalledOnce(); expect(stato.destroy).toHaveBeenCalledOnce();
  });
  it("usa l'asset della build in produzione", async () => {
    vi.stubEnv("DEV", false); stato.worker = "/assets/pdf.worker-a1b2.mjs";
    await expect(leggiFileComputo(file())).rejects.toBeInstanceOf(PdfDaLeggereConAi);
    expect(stato.src).toBe("/assets/pdf.worker-a1b2.mjs");
  });
  it("in produzione segnala un asset mancante senza tentare di caricare node_modules", async () => {
    vi.stubEnv("DEV", false);
    await expect(leggiFileComputo(file())).rejects.toThrow("Il lettore PDF non si è caricato");
    expect(stato.getDocument).not.toHaveBeenCalled();
  });
});
