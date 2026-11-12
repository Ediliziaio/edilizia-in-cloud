import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["src/test/logic/generaleGestioneGlobaleDatabase.test.ts"], testTimeout: 20_000, hookTimeout: 20_000 },
});
