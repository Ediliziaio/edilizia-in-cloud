import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pages: 1, render: vi.fn(), destroy: vi.fn() }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "worker" },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: m.pages,
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({
          width: 595 * scale,
          height: 842 * scale,
        }),
        render: () => ({ promise: m.render() }),
      }),
      loadingTask: { destroy: m.destroy },
    }),
  }),
}));
import { scansioneComeFoto } from "@/lib/ddt/dividiPdf";
beforeEach(() => {
  m.pages = 1;
  m.render.mockReset().mockResolvedValue(undefined);
  m.destroy.mockReset().mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    getImageData: () => ({ data: new Uint8ClampedArray(1600).fill(100) }),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => callback(new Blob(["foto"], { type: "image/jpeg" })),
  );
});
afterEach(() => vi.restoreAllMocks());
const file = () =>
  ({
    name: "bolla-originale.pdf",
    arrayBuffer: async () => new TextEncoder().encode("%PDF").buffer,
  }) as File;
describe("Rilettura della scansione senza perdere l'originale", () => {
  it("prepara una foto e libera le risorse senza cambiare il PDF originale", async () => {
    const pdf = file();
    const foto = await scansioneComeFoto(pdf);
    expect(foto.type).toBe("image/jpeg");
    expect(foto.name).toBe("bolla-originale-rilettura.jpg");
    expect(foto.size).toBeGreaterThan(0);
    expect(pdf.name).toBe("bolla-originale.pdf");
    expect(m.destroy).toHaveBeenCalledOnce();
  });
  it("non invia all’AI una conversione vuota", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue({
      getImageData: () => ({ data: new Uint8ClampedArray(1600).fill(255) }),
    } as unknown as CanvasRenderingContext2D);
    await expect(scansioneComeFoto(file())).rejects.toThrow("risulta vuota");
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
  });
  it("non perde le altre pagine di un PDF multipagina", async () => {
    m.pages = 2;
    await expect(scansioneComeFoto(file())).rejects.toThrow("Dividi prima");
    expect(m.render).not.toHaveBeenCalled();
    expect(m.destroy).toHaveBeenCalledOnce();
  });
  it("libera le risorse anche quando la pagina non si riesce a renderizzare", async () => {
    m.render.mockRejectedValue(new Error("Pagina illeggibile"));
    await expect(scansioneComeFoto(file())).rejects.toThrow(
      "Pagina illeggibile",
    );
    expect(m.destroy).toHaveBeenCalledOnce();
  });
});
