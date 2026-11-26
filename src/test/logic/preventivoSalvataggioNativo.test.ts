import { Capacitor } from "@capacitor/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { downloadQuotePdf } from "@/lib/preventivi/quotePdfDownload";

const nativo = vi.hoisted(() => ({ share: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/mobile/platform", () => ({ isNative: true }));
vi.mock("@capacitor/share", () => ({ Share: { share: nativo.share } }));
vi.mock("@capacitor/filesystem", () => ({ Directory: { Cache: "CACHE" }, Filesystem: { writeFile: nativo.write, rmdir: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
  nativo.write.mockResolvedValue({ uri: "file:///cache/preventivo.pdf" }); nativo.share.mockResolvedValue({ activityType: "save" });
});
afterEach(() => vi.restoreAllMocks());

it("salva il preventivo tramite il foglio del telefono con nome e copia privata del PDF", async () => {
  expect(await downloadQuotePdf(new Blob(["%PDF"], { type: "application/pdf" }), "azienda/Offerta.pdf")).toBe(true);
  expect(nativo.write).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringMatching(/\/Offerta\.pdf$/), directory: "CACHE" }));
  expect(nativo.share).toHaveBeenCalledWith(expect.objectContaining({ title: "Offerta.pdf", files: ["file:///cache/preventivo.pdf"] }));
});

it("annullare il foglio non equivale ad avere salvato il preventivo", async () => {
  nativo.share.mockRejectedValueOnce(new Error("Share canceled"));
  await expect(downloadQuotePdf(new Blob(["%PDF"]))).resolves.toBe(false);
});

it("un errore del sistema viene propagato e non presentato come salvataggio riuscito", async () => {
  nativo.share.mockRejectedValueOnce(new Error("Impossibile condividere il file"));
  await expect(downloadQuotePdf(new Blob(["%PDF"]))).rejects.toThrow("Impossibile condividere");
});
