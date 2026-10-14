import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// One generator on frontend and server. Pin the Deno dependency; regenerate when source changes.
await build({ entryPoints: [path.join(root, "scripts/variation-render/entry.ts")], bundle: true, format: "esm", platform: "neutral", target: "es2022",
  outfile: path.join(root, "supabase/functions/variante-commessa/_render.mjs"), plugins: [{ name: "deno-jspdf", setup(builder) { builder.onResolve({ filter: /^jspdf$/ }, () => ({ path: "npm:jspdf@4.2.1", external: true })); } }], logLevel: "info" });
