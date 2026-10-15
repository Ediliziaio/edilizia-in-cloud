import { Blob as NodeBlob } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPdfPreviewUrl, readPdfPreview, revokePdfPreviewUrl } from "@/lib/pdfPreviewSource";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("PDF source lifetime without CSP blob fetch", () => {
  it("reads the original bytes without network access, even after URL revocation", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:registered");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const network = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", network);
    const blob = new NodeBlob(["%PDF-test"]);
    const url = createPdfPreviewUrl(blob as unknown as Blob);
    const pending = readPdfPreview(url);
    revokePdfPreviewUrl(url);
    expect(new TextDecoder().decode(await pending)).toBe("%PDF-test");
    expect(network).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    await expect(readPdfPreview(url)).rejects.toThrow("Failed to fetch");
  });

  it("keeps independent snapshots while a newer PDF replaces the old one", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:old").mockReturnValueOnce("blob:new");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const old = createPdfPreviewUrl(new NodeBlob(["old"]) as unknown as Blob);
    const oldRead = readPdfPreview(old);
    const next = createPdfPreviewUrl(new NodeBlob(["new"]) as unknown as Blob);
    revokePdfPreviewUrl(old);
    expect(new TextDecoder().decode(await oldRead)).toBe("old");
    expect(new TextDecoder().decode(await readPdfPreview(next))).toBe("new");
    revokePdfPreviewUrl(next);
  });

  it("still supports HTTP readers and reports a failed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: false, status: 403}));
    await expect(readPdfPreview("https://example.test/pdf")).rejects.toThrow("PDF non disponibile (403)");
  });
});
