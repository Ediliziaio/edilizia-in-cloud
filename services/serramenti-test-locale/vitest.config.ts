import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  test: { environment: "node", globals: true, setupFiles: [], include: ["src/test/logic/serramentiBackendLocale.test.tsx"], maxWorkers: 1 },
});
