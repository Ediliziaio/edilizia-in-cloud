import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/computo-ai-extract/index.ts"),
  "utf8",
);

describe("computo AI extract routing", () => {
  it("routes image uploads through the photo-preventivo vision prompt instead of PDF extraction", () => {
    expect(source).toContain("FOTO_PREVENTIVO_PROMPT");
    expect(source).toContain("extractFromImageVision");
    expect(source).toContain('fileType === "image"');
    expect(source).toContain("data:image/");
    expect(source).toContain("Foto, preventivo informale o schizzo");
  });

  it("matches computo rows against tariff/labor embeddings before product fallback", () => {
    expect(source).toContain("match_tariffe_semantic");
    expect(source).toContain("isLikelyTariffaVoce");
    expect(source).toContain("matched_tariffa_id: topTariffa.id");
  });
});

describe("computo: prima i lettori deterministici, l'AI solo come ripiego", () => {
  it("il PDF di PriMus e l'XPWE non passano dall'AI e salvano gerarchia e misure", () => {
    expect(source).toContain("keepPositions: true");
    expect(source).toMatch(/tutteNative && eComputoPrimus\(pagine\)/);
    expect(source).toContain("leggiComputoPrimus(pagine)");
    expect(source).toContain("leggiComputoXpwe(buffer)");
    expect(source).toContain("misure: Array.isArray(voce.misure)");
    // Gli import della edge function sono solo moduli locali o remoti risolvibili da Deno.
    for (const m of source.matchAll(/^import .* from "([^"]+)";$/gm)) expect(m[1]).toMatch(/^(\.\.\/_shared\/[\w.]+\.ts|https:\/\/)/);
  });
  it("i moduli condivisi del computo non importano nulla fuori da _shared", () => {
    for (const file of ["computoStrutturato.ts", "computoPrimusPdf.ts", "computoXpwe.ts"]) {
      const shared = readFileSync(resolve(process.cwd(), "supabase/functions/_shared", file), "utf8");
      for (const m of shared.matchAll(/from "([^"]+)"/g)) expect(m[1]).toMatch(/^\.\/[\w]+\.ts$/);
    }
  });
});
