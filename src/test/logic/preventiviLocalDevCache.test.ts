import { describe, expect, it } from "vitest";
import { viteLocalCacheKey } from "../../../config/viteLocalCache";
describe("cache delle preview locali", () => {
  it("separa i server aperti da terminali diversi", () => {
    expect(viteLocalCacheKey("serve", "development", ["--port", "8081"], {}))
      .not.toBe(viteLocalCacheKey("serve", "development", [], {}));
  });
  it("onora la precedenza CLI sulla variabile PORT", () => {
    expect(viteLocalCacheKey("serve", "development", ["--port=8081"], { PORT: "8080" })).toMatch(/-8081$/);
    expect(viteLocalCacheKey("serve", "development", [], { PORT: "8088" })).toMatch(/-8088$/);
  });
  it("separa build, mobile e web", () => {
    const keys = [
      viteLocalCacheKey("build", "production", [], {}),
      viteLocalCacheKey("serve", "development", [], {}),
      viteLocalCacheKey("serve", "development", [], { VITE_APP_MODE: "mobile" }),
    ];
    expect(new Set(keys).size).toBe(3);
  });
  it("resta una singola directory anche con valori non validi", () => {
    const key = viteLocalCacheKey("serve", "../../custom", ["--port", "garbage"], { VITE_APP_MODE: "../mobile" });
    expect(key).not.toMatch(/[./]/);
    expect(key).toMatch(/-8080$/);
  });
});
