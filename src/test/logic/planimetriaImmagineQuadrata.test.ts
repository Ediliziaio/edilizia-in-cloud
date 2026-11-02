import { afterEach, describe, expect, it, vi } from "vitest";
import { preparaImmagine, serveQuadrato } from "@/components/planimetrie/editor/generazione";

describe("fogli resi quadrati prima di mandarli all'AI", () => {
  it("serve solo quando la forma si discosta dal quadrato", () => {
    expect(serveQuadrato(1100, 1000)).toBe(false);
    expect(serveQuadrato(1000, 1000)).toBe(false);
    expect(serveQuadrato(1700, 900)).toBe(true);
    expect(serveQuadrato(900, 1700)).toBe(true);
    expect(serveQuadrato(1448, 1086)).toBe(true);
  });
});

describe("preparaImmagine con margini bianchi", () => {
  const creati: Array<{ width: number; height: number; disegni: Array<[number, number]> }> = [];
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); creati.length = 0; });

  function prepara(larghezza: number, altezza: number) {
    class FinteImg { naturalWidth = larghezza; naturalHeight = altezza; onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_: string) { queueMicrotask(() => this.onload?.()); } }
    vi.stubGlobal("Image", FinteImg);
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    const reale = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return reale(tag);
      const c = { width: 0, height: 0, disegni: [] as Array<[number, number]> } as { width: number; height: number; disegni: Array<[number, number]>; getContext: unknown; toBlob: unknown };
      c.getContext = () => ({
        fillStyle: "", fillRect() {}, translate() {}, rotate() {}, setTransform() {}, putImageData() {},
        drawImage(_i: unknown, x: number, y: number) { c.disegni.push([x, y]); },
        getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
      });
      c.toBlob = (ok: (b: Blob) => void) => ok(new Blob(["x"], { type: "image/png" }));
      creati.push(c as never);
      return c as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    return preparaImmagine(new Blob(["x"], { type: "image/jpeg" }));
  }

  it("un foglio largo diventa un quadrato, centrato", async () => {
    const r = await prepara(1700, 900);
    expect(r).toMatchObject({ larghezza: 1700, altezza: 1700, mime: "image/png" });
    const quadrato = creati[creati.length - 1];
    expect(quadrato.disegni).toEqual([[0, 400]]); // 900 di altezza in mezzo a 1700: 400 di bianco sopra e sotto
  });

  it("un foglio alto diventa un quadrato, centrato", async () => {
    const r = await prepara(800, 1600);
    expect(r).toMatchObject({ larghezza: 1600, altezza: 1600 });
    expect(creati[creati.length - 1].disegni).toEqual([[400, 0]]);
  });

  it("un foglio già quasi quadrato parte com'è", async () => {
    const r = await prepara(1100, 1000);
    expect(r).toMatchObject({ larghezza: 1100, altezza: 1000, invertita: false });
    expect(r?.mime).toBe("image/jpeg");
  });
});
