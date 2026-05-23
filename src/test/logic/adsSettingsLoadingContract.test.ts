import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ads settings loading contract", () => {
  const metaPixelHook = readFileSync(
    resolve(process.cwd(), "src/hooks/useMetaPixelConfig.ts"),
    "utf8",
  );
  const spendGuardHook = readFileSync(
    resolve(process.cwd(), "src/hooks/useAdSpendGuard.ts"),
    "utf8",
  );

  it("does not show persistent loaders when default settings are already usable", () => {
    expect(metaPixelHook).toContain("placeholderData: null");
    expect(metaPixelHook).toContain("isLoading: query.isLoading && query.data === undefined");
    expect(spendGuardHook).toContain("placeholderData: null");
    expect(spendGuardHook).toContain("isLoading: query.isLoading && query.data === undefined");
  });
});
