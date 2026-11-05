import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
export default defineConfig({
  root: path.resolve(__dirname, "dev/aspetto3d"),
  publicDir: false,
  plugins: [react()],
  cacheDir: path.resolve(__dirname, "node_modules/.vite-aspetto-local"),
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { host: "127.0.0.1", port: 8091, strictPort: true, fs: { allow: [__dirname] } },
});
