import { afterEach, describe, expect, it, vi } from "vitest";
import { apriPdfFirmato } from "@/lib/fea/pdfFirmatoDownload";

afterEach(() => vi.restoreAllMocks());
function nuovaScheda() {
  const scheda = { opener: window, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(scheda as unknown as Window);
  return scheda;
}
describe("Copia firmata: download mobile", () => {
  it("apre la scheda prima di attendere il server e rimuove l'opener", async () => {
    const scheda = nuovaScheda();
    const recupera = vi.fn(async () => {
      expect(window.open).toHaveBeenCalledWith("", "_blank");
      expect(scheda.opener).toBeNull();
      return "https://example.test/firmato.pdf";
    });
    await apriPdfFirmato(recupera);
    expect(scheda.location.replace).toHaveBeenCalledWith("https://example.test/firmato.pdf");
    expect(scheda.close).not.toHaveBeenCalled();
  });
  it("se il browser blocca la scheda avvisa, senza avviare una generazione inutile", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const recupera = vi.fn();
    await expect(apriPdfFirmato(recupera)).rejects.toThrow("Consenti i popup");
    expect(recupera).not.toHaveBeenCalled();
  });
  it("chiude la scheda vuota in caso di errore server", async () => {
    const scheda = nuovaScheda();
    await expect(apriPdfFirmato(async () => { throw new Error("PDF non disponibile"); })).rejects.toThrow("PDF non disponibile");
    expect(scheda.close).toHaveBeenCalledOnce();
  });
  it("non apre protocolli pericolosi", async () => {
    const scheda = nuovaScheda();
    await expect(apriPdfFirmato(async () => "javascript:alert(1)")).rejects.toThrow("Link alla copia firmata non valido");
    expect(scheda.location.replace).not.toHaveBeenCalled(); expect(scheda.close).toHaveBeenCalledOnce();
  });
  it("se l'utente chiude la scheda non dichiara che il download è riuscito", async () => {
    const scheda = nuovaScheda(); scheda.closed = true;
    await expect(apriPdfFirmato(async () => "https://example.test/firmato.pdf")).rejects.toThrow("scheda del PDF è stata chiusa");
    expect(scheda.location.replace).not.toHaveBeenCalled();
  });
});
