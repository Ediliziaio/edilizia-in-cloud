import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { compressImage } from "@/lib/campo/compressImage";

let toBlob: ReturnType<typeof vi.fn>;
let image: { onload: (() => void) | null; onerror: (() => void) | null };
let canvas: HTMLCanvasElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:foto-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal("Image", class {
    width = 2000; height = 1000;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- Osserva i callback del dispositivo simulato.
      image = this;
    }
    set src(_value: string) { Promise.resolve().then(() => this.onload?.()); }
  });
  toBlob = vi.fn(callback => callback(new Blob(["jpeg"], { type: "image/jpeg" })));
  canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob } as unknown as HTMLCanvasElement;
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => tag === "canvas" ? canvas : original(tag, options));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const file = () => new File(["foto"], "doc.png", { type: "image/png" });

it("converte, preserva le proporzioni e libera URL e timer", async () => {
  const blob = await compressImage(file());
  expect(blob.type).toBe("image/jpeg");
  expect(canvas.width).toBe(1280); expect(canvas.height).toBe(640);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:foto-test");
  expect(vi.getTimerCount()).toBe(0);
});
it("canvas null rifiuta la conversione e permette il fallback", async () => {
  toBlob.mockImplementation(callback => callback(null));
  await expect(compressImage(file())).rejects.toThrow("toBlob returned null");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:foto-test");
  expect(vi.getTimerCount()).toBe(0);
});
it("non resta bloccato se il dispositivo non restituisce mai il blob", async () => {
  toBlob.mockImplementation(() => {});
  const result = compressImage(file()).catch(error => error);
  await vi.advanceTimersByTimeAsync(20000);
  expect(await result).toEqual(expect.objectContaining({ message: "image conversion timeout" }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:foto-test");
  expect(vi.getTimerCount()).toBe(0);
});
it("un errore sincrono di canvas non lascia timer attivi", async () => {
  toBlob.mockImplementation(() => { throw new Error("canvas error"); });
  await expect(compressImage(file())).rejects.toThrow("canvas error");
  expect(vi.getTimerCount()).toBe(0);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:foto-test");
});
it("una risposta di conversione tardiva non riapre l'operazione", async () => {
  let callback!: BlobCallback;
  toBlob.mockImplementation(cb => { callback = cb; });
  const settled = vi.fn();
  const result = compressImage(file()).then(settled, settled);
  await vi.advanceTimersByTimeAsync(20000);
  callback(new Blob(["tardi"])); await result;
  expect(settled).toHaveBeenCalledOnce();
  expect(settled).toHaveBeenCalledWith(expect.any(Error));
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
it("anche il timeout di caricamento scollega i callback dell'immagine", async () => {
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- Osserva i callback del dispositivo simulato.
      image = this;
    }
    set src(_value: string) {}
  });
  const result = compressImage(file()).catch(error => error);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await result).toEqual(expect.objectContaining({ message: "image load timeout" }));
  expect(image.onload).toBeNull(); expect(image.onerror).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});

it("un errore nell'apertura dell'immagine non lascia il timer sospeso", async () => {
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(_value: string) { throw new Error("device image error"); }
  });
  await expect(compressImage(file())).rejects.toThrow("device image error");
  expect(vi.getTimerCount()).toBe(0);
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
