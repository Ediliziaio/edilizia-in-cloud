import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/pages/azienda/AIMemoryPage.tsx"),
  "utf8",
);

describe("AI memory page knowledge console contract", () => {
  it("aligns the memory list with the demo brain graph coverage", () => {
    expect(source).toContain("DEMO_AI_PERSONAS");
    expect(source).toContain("DEMO_MEMORIES");
    expect(source).toContain("resolveDemoPersonaKey");
    expect(source).toContain("demoPreviewMemories");
    expect(source).toContain("Memorie demo");
  });

  it("surfaces memory quality instead of only CRUD totals", () => {
    expect(source).toContain("qualityFilter");
    expect(source).toContain("personasWithoutMemories");
    expect(source).toContain("lowConfidence");
    expect(source).toContain("neverUsed");
    expect(source).toContain("Centro controllo memoria");
  });

  it("uses operational actions and clearer filter labels", () => {
    expect(source).toContain("Includi disabilitate");
    expect(source).toContain("Completa personas");
    expect(source).toContain("Vedi nel Cervello");
  });
});
