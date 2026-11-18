import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { BlogCover } from "@/components/blog/BlogCover";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps the original JPG when the article has no generated WebP", () => {
  const { container } = render(<BlogCover src="/blog/covers/gestione-richieste-preventivi-edilizia-2027.jpg" alt="Richieste" />);
  expect(container.querySelector("source")).toBeNull();
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/blog/covers/gestione-richieste-preventivi-edilizia-2027.jpg");
});

it("retains both real responsive variants for an existing cover", () => {
  const { container } = render(<BlogCover src="/blog/covers/sistema-fatturazione-aziende-edili.jpg" alt="Fatturazione" />);
  expect(container.querySelector("source")?.getAttribute("srcset")).toBe("/blog/covers/sistema-fatturazione-aziende-edili-600.webp 600w, /blog/covers/sistema-fatturazione-aziende-edili.webp 1200w");
});

it("does not persist the prerender server origin after loading a relative slider image", () => {
  const preloaders: HTMLImageElement[] = [];
  const NativeImage = window.Image;
  vi.stubGlobal("Image", function () {
    const image = new NativeImage();
    Object.defineProperty(image, "src", {
      get() { return "http://127.0.0.1:4173" + image.getAttribute("src"); },
      set(value: string) { image.setAttribute("src", value); },
    });
    Object.defineProperty(image, "naturalWidth", { value: 1024 });
    Object.defineProperty(image, "naturalHeight", { value: 1536 });
    preloaders.push(image);
    return image;
  });
  const { container } = render(<BeforeAfterSlider beforeUrl="/images/render-infissi/demo-prima.webp" afterUrl="/images/render-infissi/demo-dopo.webp" />);
  act(() => { for (const image of preloaders) image.onload?.(new Event("load")); });
  const sources = [...container.querySelectorAll("img")].map(image => image.getAttribute("src"));
  expect(sources).toContain("/images/render-infissi/demo-dopo.webp");
  expect(sources.some(src => src?.includes("127.0.0.1"))).toBe(false);
});
