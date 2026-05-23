import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("social uploader contract", () => {
  it("returns uploaded storage media to callers even when ad_media indexing is not migrated yet", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/ads/AdMediaUploader.tsx"),
      "utf8",
    );

    const schemaMissingBranch = source.slice(
      source.indexOf('msg.includes("does not exist")'),
      source.indexOf("throw insertErr;"),
    );

    expect(schemaMissingBranch).toContain("onUploaded?.({ id: fallbackMediaId, public_url: publicUrl })");
    expect(schemaMissingBranch).toContain("resetUploadState();");
  });
});
