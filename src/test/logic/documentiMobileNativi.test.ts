import { Capacitor } from "@capacitor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apriDocumentoDopoAttesa, apriDocumentoDaRichiesta } from "@/lib/campo/apriDocumento";
import { createPdfPreviewUrl, revokePdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { svuotaCacheDocumenti } from "@/lib/mobile/fileCache";

const native = vi.hoisted(() => ({ openUrl: vi.fn(), openPath: vi.fn(), write: vi.fn(), remove: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@capacitor/file-viewer", () => ({ FileViewer: { openDocumentFromUrl: native.openUrl, openDocumentFromLocalPath: native.openPath } }));
vi.mock("@capacitor/filesystem", () => ({ Directory: { Cache: "CACHE" }, Filesystem: { writeFile: native.write, rmdir: native.remove } }));

beforeEach(async () => {
  await svuotaCacheDocumenti();
  vi.clearAllMocks();
  vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
  vi.spyOn(window, "open").mockReturnValue(null);
  native.openUrl.mockResolvedValue(undefined);
  native.openPath.mockResolvedValue(undefined);
  native.write.mockResolvedValue({ uri: "file:///cache/documento.pdf" });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("documenti nell'app installata", () => {
  it("apre il link privato nel visualizzatore del telefono senza cambiare pagina nell'app", async () => {
    const url = "https://storage.example.test/documento.pdf?token=firmato";
    expect(await apriDocumentoDopoAttesa(async () => url)).toBe(true);
    expect(window.open).not.toHaveBeenCalled();
    expect(native.openUrl).toHaveBeenCalledWith({ url });
  });

  it("se il visualizzatore fallisce comunica il mancato avvio", async () => {
    native.openUrl.mockRejectedValue(new Error("nessuna app per il formato"));
    expect(await apriDocumentoDopoAttesa(async () => "https://storage.example.test/documento.pdf")).toBe(false);
  });

  it("i flussi con popup obbligatorio sul web aprono comunque il visualizzatore nativo", async () => {
    await apriDocumentoDaRichiesta(async () => "https://storage.example.test/PSC.pdf", "PSC.pdf", { richiediScheda: true });
    expect(window.open).not.toHaveBeenCalled();
    expect(native.openUrl).toHaveBeenCalledWith({ url: "https://storage.example.test/PSC.pdf" });
  });

  it("conserva il messaggio di accesso negato senza tentare di aprire il file", async () => {
    await expect(apriDocumentoDaRichiesta(async () => { throw new Error("Accesso negato"); })).rejects.toThrow("Accesso negato");
    expect(native.openUrl).not.toHaveBeenCalled();
    expect(native.openPath).not.toHaveBeenCalled();
  });

  it("un vecchio file senza estensione mantiene il formato PDF nella cache", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["%PDF"], { type: "application/pdf" }) }));
    expect(await apriDocumentoDopoAttesa(async () => "https://storage.example.test/documento", "Busta paga")).toBe(true);
    expect(native.write).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringMatching(/\/Busta paga\.pdf$/) }));
    expect(native.openPath).toHaveBeenCalled();
    expect(native.openUrl).not.toHaveBeenCalled();
  });

  it("non apre uno schema eseguibile arrivato al posto di un documento", async () => {
    expect(await apriDocumentoDopoAttesa(async () => "javascript:alert('documento')")).toBe(false);
    expect(native.openUrl).not.toHaveBeenCalled();
  });

  it("apre il PDF scaricato con la sessione corrente da un file privato della cache", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["%PDF-prova"], { type: "application/pdf" }) }));
    expect(await apriDocumentoDopoAttesa(async () => "blob:https://localhost/documento", "Contratto.pdf")).toBe(true);
    expect(native.write).toHaveBeenCalledWith(expect.objectContaining({
      path: expect.stringMatching(/^documenti-temporanei\/[^/]+\/Contratto\.pdf$/), directory: "CACHE", recursive: true,
    }));
    expect(native.openPath).toHaveBeenCalledWith({ path: "file:///cache/documento.pdf" });
    expect(native.openUrl).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("un errore di scrittura sul telefono non viene presentato come un'apertura riuscita", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["pdf"], { type: "application/pdf" }) }));
    native.write.mockRejectedValue(new Error("spazio esaurito"));
    expect(await apriDocumentoDopoAttesa(async () => "blob:https://localhost/documento", "Documento.pdf")).toBe(false);
    expect(native.openPath).not.toHaveBeenCalled();
  });

  it("all'uscita elimina la copia privata usata per aprire il documento", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["%PDF"], { type: "application/pdf" }) }));
    await apriDocumentoDaRichiesta(async () => "blob:https://localhost/riservato", "Contratto.pdf");
    const cartella = native.write.mock.calls[0][0].path.replace(/\/[^/]+$/, "");
    await svuotaCacheDocumenti();
    expect(native.remove).toHaveBeenCalledWith({ path: cartella, directory: "CACHE", recursive: true });
  });

  it("se l'utente esce durante la scrittura non apre il documento nella sessione successiva", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["%PDF"], { type: "application/pdf" }) }));
    let completa!: (value: { uri: string }) => void;
    native.write.mockImplementationOnce(() => new Promise(resolve => { completa = resolve; }));
    const apertura = apriDocumentoDaRichiesta(async () => "blob:https://localhost/riservato", "Contratto.pdf");
    await vi.waitFor(() => expect(native.write).toHaveBeenCalled());
    await svuotaCacheDocumenti();
    completa({ uri: "file:///cache/Contratto.pdf" });
    await expect(apertura).rejects.toThrow("Sessione cambiata");
    expect(native.openPath).not.toHaveBeenCalled();
  });

  it("legge il Blob originale delle anteprime anche quando la CSP vieta fetch(blob:)", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:https://localhost/pdf-csp") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const fetchFinto = vi.fn().mockRejectedValue(new Error("connect-src blocca blob:"));
    vi.stubGlobal("fetch", fetchFinto);
    const url = createPdfPreviewUrl(new Blob(["%PDF"], { type: "application/pdf" }));
    try {
      expect(await apriDocumentoDopoAttesa(async () => url, "Preventivo.pdf")).toBe(true);
      expect(native.openPath).toHaveBeenCalled();
      expect(fetchFinto).not.toHaveBeenCalled();
    } finally { revokePdfPreviewUrl(url); }
  });
});
