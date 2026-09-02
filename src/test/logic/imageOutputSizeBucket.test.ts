import { describe, expect, it } from "vitest";
import {
  PORTRAIT_SQUARE_BOUNDARY,
  SQUARE_LANDSCAPE_BOUNDARY,
  expectedOutputSize,
} from "../../../supabase/functions/_shared/imageDimensions";

/**
 * Il formato di output OpenAI (1:1, 2:3, 3:2) deve essere quello PIU' VICINO
 * al rapporto della foto. Regressione: una foto 4:5 (1080x1350) finiva nel
 * quadrato e il modello tagliava soffitto e pavimento.
 */
describe("expectedOutputSize — secchio piu' vicino al rapporto della foto", () => {
  const PORTRAIT = { width: 1024, height: 1536 };
  const LANDSCAPE = { width: 1536, height: 1024 };
  const SQUARE = { width: 1024, height: 1024 };

  it("i confini sono i punti di mezzo geometrici tra i tre rapporti", () => {
    expect(PORTRAIT_SQUARE_BOUNDARY).toBeCloseTo(Math.sqrt(2 / 3), 6);
    expect(SQUARE_LANDSCAPE_BOUNDARY).toBeCloseTo(Math.sqrt(3 / 2), 6);
  });

  it.each([
    ["4:5 smartphone/Instagram (1080x1350)", 1080, 1350, PORTRAIT],
    ["3:4 iPhone verticale (3024x4032)", 3024, 4032, PORTRAIT],
    ["9:16 storia (1080x1920)", 1080, 1920, PORTRAIT],
    ["2:3 esatto (1024x1536)", 1024, 1536, PORTRAIT],
    ["quadrato (2000x2000)", 2000, 2000, SQUARE],
    ["quasi quadrato 10:9 (1000x900)", 1000, 900, SQUARE],
    ["4:3 iPhone orizzontale (4032x3024)", 4032, 3024, LANDSCAPE],
    ["5:4 (1350x1080)", 1350, 1080, LANDSCAPE],
    ["16:9 (1920x1080)", 1920, 1080, LANDSCAPE],
    ["3:2 esatto (1536x1024)", 1536, 1024, LANDSCAPE],
  ])("%s", (_label, w, h, atteso) => {
    expect(expectedOutputSize(w, h)).toEqual(atteso);
  });

  it("senza dimensioni note ripiega sul quadrato", () => {
    expect(expectedOutputSize(undefined, undefined)).toEqual(SQUARE);
    expect(expectedOutputSize(0, 100)).toEqual(SQUARE);
  });

  it("ogni rapporto finisce nel secchio con la minima distanza logaritmica", () => {
    const buckets = [
      { ratio: 2 / 3, size: PORTRAIT },
      { ratio: 1, size: SQUARE },
      { ratio: 3 / 2, size: LANDSCAPE },
    ];
    for (let r = 0.3; r <= 3.0; r += 0.017) {
      const best = buckets.reduce((a, b) =>
        Math.abs(Math.log(r / b.ratio)) < Math.abs(Math.log(r / a.ratio)) ? b : a
      );
      expect(expectedOutputSize(r * 1000, 1000)).toEqual(best.size);
    }
  });
});
