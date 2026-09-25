import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";

describe("miniature locali del popup", () => {
  for (const area of SALES_AREAS) for (const item of area.interventions) {
    it(`${area.id}/${item.id}: WebP presente e leggero`, () => {
      const file = path.resolve("public/quote-picker", `${area.id}-${item.id}.webp`);
      expect(statSync(file).size).toBeLessThan(90_000);
      expect(readFileSync(file).subarray(8, 12).toString()).toBe("WEBP");
    });
  }
});
