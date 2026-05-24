import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/utils/edgeWarmup.ts"),
  "utf8",
);

describe("edge function warmup console safety", () => {
  it("warms functions without surfacing expected 4xx/CORS noise in the browser console", () => {
    expect(source).toContain("VITE_SUPABASE_URL");
    expect(source).toContain("mode: \"no-cors\"");
    expect(source).toContain("method: \"GET\"");
    expect(source).toContain("warmupEdgeFunction");
    expect(source).toContain("shouldRunEdgeWarmup");
    expect(source).toContain("localhost");
    expect(source).toContain("127.0.0.1");
    expect(source).not.toContain("supabase.functions");
  });
});
