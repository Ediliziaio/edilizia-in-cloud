import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["src/test/logic/saltedge*.test.ts"], maxWorkers: 1, testTimeout: 20000, hookTimeout: 60000 },
});
