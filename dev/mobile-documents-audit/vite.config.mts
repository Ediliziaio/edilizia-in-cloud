import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../..", import.meta.url));
const mocks = ["@/hooks/useHrDocumenti", "@/hooks/usePermissions", "@/components/sicurezza/QualificheAddetto", "@/lib/campo/timbra", "@/lib/campo/lingua/LinguaCampo"];
export default defineConfig({
  root: here, envDir: root, publicDir: root + "/public", plugins: [react()],
  cacheDir: root + "/node_modules/.vite-mobile-documents-audit", css: { postcss: root },
  resolve: { alias: [...mocks.map(find => ({ find, replacement: here + "/stubs.tsx" })), { find: "@", replacement: root + "/src" }] },
  server: { host: "127.0.0.1", port: 4187, strictPort: true, fs: { allow: [root] } },
});
