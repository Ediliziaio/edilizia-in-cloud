import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

const root = path.resolve(__dirname, "dev/preventivatore-ai");
export default defineConfig({
  root,
  envDir: root,
  publicDir: false,
  cacheDir: path.resolve(__dirname, "node_modules/.vite-preventivatore-demo"),
  plugins: [react()],
  resolve: { alias: [
    { find: /^@\/integrations\/supabase\/client$/, replacement: path.join(root, "services.ts") },
    { find: /^@\/lib\/velocity\/sentry$/, replacement: path.join(root, "services.ts") },
    { find: "@", replacement: path.resolve(__dirname, "src") },
  ] },
  server: {
    host: "127.0.0.1", port: 8082, strictPort: true,
    fs: { allow: [__dirname] },
    headers: {
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:8082; frame-src 'none'; form-action 'none'; object-src 'none'",
    },
  },
});
