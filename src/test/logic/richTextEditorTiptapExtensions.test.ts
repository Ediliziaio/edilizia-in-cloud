import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/ui/rich-text-editor.tsx"),
  "utf8",
);

describe("rich text editor TipTap extension registry", () => {
  it("disables StarterKit extensions that are registered with custom configuration", () => {
    expect(source).toContain("link: false");
    expect(source).toContain("underline: false");
    expect(source).toContain("Link.configure");
    expect(source).toContain("Underline,");
  });
});
