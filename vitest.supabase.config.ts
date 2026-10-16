import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: [],
    include: ["src/test/logic/supabasePreviewReplay.test.ts"],
    maxWorkers: 1,
    testTimeout: 15000,
  },
});
