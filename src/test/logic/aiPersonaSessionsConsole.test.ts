import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/pages/azienda/impostazioni/AIPersonasSessionsTab.tsx"),
  "utf8",
);

describe("AI personas sessions console contract", () => {
  it("aligns sessions with the same demo personas used by memory and brain", () => {
    expect(source).toContain("DEMO_AI_PERSONAS");
    expect(source).toContain("DEMO_MEMORIES");
    expect(source).toContain("resolveDemoPersonaKey");
    expect(source).toContain("demoPreviewSessions");
    expect(source).toContain("Sessioni demo");
  });

  it("surfaces operational session quality instead of only a chronological list", () => {
    expect(source).toContain("sessionQualityFilter");
    expect(source).toContain("personasWithoutSessions");
    expect(source).toContain("Centro controllo sessioni");
    expect(source).toContain("Copertura conversazioni");
    expect(source).toContain("Da trasformare");
  });

  it("keeps session actions connected to chat, memory and brain", () => {
    expect(source).toContain("Apri in Memoria");
    expect(source).toContain("Vedi nel Cervello");
    expect(source).toContain("Continua chat");
    expect(source).toContain("Promuovi selezione a memoria");
  });
});
