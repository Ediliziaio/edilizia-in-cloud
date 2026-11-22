import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react(), {
    // I test delle regole pure non caricano il motore Deno nel runtime Node.
    // Il lettore reale è verificato da test:pdf-runtime con lock e versione server.
    name: "edge-npm-runtime-external",
    enforce: "pre",
    resolveId(id) {
      if (id === "npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs" || id === "npm:pdfjs-dist@4.0.379/legacy/build/pdf.worker.mjs") {
        return { id, external: true };
      }
    },
  }],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "https://esm.sh/@supabase/supabase-js@2": "@supabase/supabase-js", "https://esm.sh/pdf-lib@1.17.1": "pdf-lib",
      "https://esm.sh/fontkit@2.0.4": "fontkit", "@": path.resolve(__dirname, "./src") },
  },
});
