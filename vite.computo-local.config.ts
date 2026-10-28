import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "dev/computo-metrico"),
  envDir: path.resolve(__dirname, "dev/computo-metrico"),
  publicDir: false,
  plugins: [react()],
  cacheDir: path.resolve(__dirname, "node_modules/.vite-computo-local"),
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: { outDir: path.resolve(__dirname, "node_modules/.cache/computo-local-build"), emptyOutDir: true },
  server: { host: "127.0.0.1", port: 8083, strictPort: true, fs: { allow: [__dirname] } },
});
