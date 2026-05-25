import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const changelogSource = readFileSync("src/components/changelog/ChangelogDrawer.tsx", "utf8");
const silvioSource = readFileSync("src/components/silvio/SilvioBellPopover.tsx", "utf8");

describe("topbar icon distinctness", () => {
  it("keeps changelog and Silvio triggers visually different", () => {
    expect(changelogSource).toContain("<Megaphone className={cn(\"h-4 w-4\"");
    expect(changelogSource).not.toContain("<Sparkles className={cn(\"h-4 w-4\"");
    expect(silvioSource).toContain("<Sparkles className={cn(");
  });
});
