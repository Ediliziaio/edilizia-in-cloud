import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const companyLayoutSource = readFileSync("src/components/layouts/CompanyLayout.tsx", "utf8");

describe("company sidebar menu stability", () => {
  it("does not clip expanded macro-area rows with height animations", () => {
    expect(companyLayoutSource).not.toContain("animate-sidebar-slide-down");
    expect(companyLayoutSource).not.toContain("animate-sidebar-slide-up");
  });
});
