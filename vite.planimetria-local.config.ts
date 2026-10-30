import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "dev/planimetria-editor"),
  envDir: path.resolve(__dirname, "dev/planimetria-editor"),
  publicDir: false,
  plugins: [react()],
  cacheDir: path.resolve(__dirname, "node_modules/.vite-planimetria-local"),
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: { outDir: path.resolve(__dirname, "node_modules/.cache/planimetria-local-build"), emptyOutDir: true },
  server: { host: "127.0.0.1", port: 8084, strictPort: true, fs: { allow: [__dirname] } },
});
