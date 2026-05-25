import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/silvio/SilvioFAB.tsx", "utf8");

describe("Silvio lateral assistant experience", () => {
  it("keeps the side panel operational instead of looking like a shortcut menu", () => {
    expect(source).toContain("Regia Silvio");
    expect(source).toContain("Scrivi a Silvio");
    expect(source).toContain("Priorita operative");
    expect(source).toContain("Carica documento");
    expect(source).toContain("Contesto pagina");
    expect(source).toContain("Ultime attivita");
  });

  it("does not use purple/violet tones in the Silvio launcher panel", () => {
    expect(source).not.toMatch(/purple|violet/i);
  });
});
