import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
/** Native PDF QA avoids jsdom's cross-realm typed arrays corrupting binary image streams. */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/test/logic/energySurvey.test.tsx"],
    maxWorkers: 1,
  },
});
