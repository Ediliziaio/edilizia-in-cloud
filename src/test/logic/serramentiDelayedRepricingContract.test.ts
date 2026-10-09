import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("delayed repricing write contract", () => {
  it("never writes the stale quantity or other previous commercial choices", () => {
    const source = readFileSync("src/components/serramenti/StepBom.tsx", "utf8");
    const effect = source.slice(source.indexOf("const attesa = ricalcoloInSospeso.current;"));
    const block = effect.slice(0, effect.indexOf("}, [datiInArrivo]);"));
    expect(block).toContain("s.quantita ?? 1");
    expect(block).not.toContain("attesa.Q");
    expect(block).not.toContain("attesa.L");
    const patch = block.match(/onPatch\(\{([\s\S]*?)\}\)/)?.[1];
    expect(patch).toBeDefined();
    expect(patch).toContain("prezzo_unitario:");
    expect(patch).not.toMatch(/quantita:|larghezza_mm:|altezza_mm:|valori_assi:|posa_esclusa:/);
  });
});
