import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
const root = path.resolve(__dirname, "dev/fv-bolletta-qa");
export default defineConfig({
  root,
  envDir: root,
  publicDir: false,
  cacheDir: path.resolve(
    __dirname,
    "work/fotovoltaico-bolletta-layout-20261120/vite-cache",
  ),
  plugins: [react()],
  resolve: {
    alias: [{
      find: /^@\/contexts\/AuthContext$/,
      replacement: path.resolve(
        __dirname,
        "dev/fotovoltaico-locale/authLocale.ts",
      ),
    }, {
      find: /^@\/hooks\/(useEffectiveCompanyId|usePermissions)$/,
      replacement: path.resolve(root, "context.ts"),
    }, {
      find: /^@\/integrations\/supabase\/client$/,
      replacement: path.resolve(root, "services.ts"),
    }, {
      find: /^@\/lib\/velocity\/sentry$/,
      replacement: path.resolve(root, "services.ts"),
    }, { find: "@", replacement: path.resolve(__dirname, "src") }],
  },
  define: { __APP_MODE__: JSON.stringify("full") },
  server: {
    host: "127.0.0.1",
    port: 5193,
    strictPort: true,
    fs: { allow: [__dirname] },
  },
  build: {
    copyPublicDir: false,
    outDir: path.resolve(
      __dirname,
      "work/fotovoltaico-bolletta-layout-20261120/preview-dist",
    ),
  },
});
