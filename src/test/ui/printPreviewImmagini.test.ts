import { describe, expect, it, vi } from "vitest";
import { immaginiCaricate } from "@/components/shared/PrintPreviewModal";

const immagine = (complete: boolean) => {
  const img = document.createElement("img");
  Object.defineProperty(img, "complete", { value: complete });
  return img;
};
const documento = (...images: HTMLImageElement[]) => ({ images: images as unknown as HTMLCollectionOf<HTMLImageElement> });

describe("Prima di stampare si aspettano le immagini", () => {
  it("se sono già arrivate non aspetta", async () => {
    await expect(immaginiCaricate(documento(immagine(true)))).resolves.toBeUndefined();
  });
  it("aspetta quella in arrivo, e anche una che fallisce sblocca la stampa", async () => {
    const a = immagine(false), b = immagine(false);
    let finito = false;
    const attesa = immaginiCaricate(documento(a, b)).then(() => { finito = true; });
    a.dispatchEvent(new Event("load"));
    await Promise.resolve();
    expect(finito).toBe(false);
    b.dispatchEvent(new Event("error"));
    await attesa;
    expect(finito).toBe(true);
  });
  it("una foto che non arriva non blocca per sempre", async () => {
    vi.useFakeTimers();
    const attesa = immaginiCaricate(documento(immagine(false)), 8000);
    await vi.advanceTimersByTimeAsync(8000);
    await expect(attesa).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
