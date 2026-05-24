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
