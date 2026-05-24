import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/auth/LoginForm.tsx"),
  "utf8",
);

describe("login auth warmup console safety", () => {
  it("sends the publishable key when pinging Supabase auth health", () => {
    expect(source).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(source).toContain("apikey");
    expect(source).toContain("/auth/v1/health");
  });
});
