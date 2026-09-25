import { describe, expect, it } from "vitest";
import { COVER_PRESETS as BAGNI_PRESETS } from "@/components/bagni/coverPresets";
import { COVER_PRESETS as FV_PRESETS } from "@/components/fotovoltaico/coverPresets";
import { COVER_PRESETS as RST_PRESETS } from "@/components/ristrutturazione/coverPresets";
import { COVER_PRESETS as SR_PRESETS } from "@/components/serramenti/coverPresets";
import { COVER_STOCK_IMAGES as RST_IMAGES } from "@/components/ristrutturazione/coverStockImages";

describe("preset fotografici dei moduli preventivo", () => {
  it("usa solo immagini locali riproducibili nei quattro moduli principali", () => {
    const presets = [...BAGNI_PRESETS, ...FV_PRESETS, ...RST_PRESETS, ...SR_PRESETS];
    const photoUrls = presets
      .filter((preset) => preset.category === "photo")
      .map((preset) => preset.patch.pdf_cover_image_url)
      .filter((url): url is string => typeof url === "string");

    expect(photoUrls.length).toBeGreaterThan(0);
    expect(photoUrls.every((url) => url.startsWith("/cover-stock/"))).toBe(true);
    expect(photoUrls.some((url) => url.includes("images.unsplash.com"))).toBe(false);
  });

  it("non propone la vecchia immagine piscina nel modulo ristrutturazione", () => {
    expect(RST_IMAGES.map((image) => image.url)).toEqual([
      "/cover-stock/ristrutturazione/1.jpg",
      "/cover-stock/ristrutturazione/2.jpg",
    ]);
  });
});
