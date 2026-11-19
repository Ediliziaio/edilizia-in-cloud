import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
export default defineConfig({
  root: path.resolve(__dirname, "dev/articoli-popup-unico"),
  envDir: path.resolve(__dirname, "dev/articoli-popup-unico"),
  publicDir: false,
  plugins: [react()],
  define: { "import.meta.env.VITE_ARTICOLI_ISOLATI": JSON.stringify("true") },
  cacheDir: "/private/tmp/eic-articoli-vite-cache-20261119",
  resolve: { alias: [
    { find: "@/integrations/supabase/client", replacement: path.resolve(__dirname, "dev/articoli-popup-unico/supabase-locale.ts") },
    { find: "@", replacement: path.resolve(__dirname, "src") },
  ] },
  build: { outDir: "/private/tmp/eic-articoli-build-20261119", emptyOutDir: true },
  server: { host: "127.0.0.1", port: 8098, strictPort: true, fs: { allow: [__dirname] } },
});
