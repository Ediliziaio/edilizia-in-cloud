// Re-encode existing local covers for the chooser; originals stay untouched.
import { createServer } from "vite";
import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const server = await createServer({ configFile: false, root, cacheDir: "node_modules/.vite-quote-thumbnails", optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: "custom" });
try {
  const { FULL_MODULE_COVERS } = await server.ssrLoadModule("/src/lib/moduli-vendita/fullModuleCatalog.ts");
  const destination = path.join(root, "public/quote-picker");
  await mkdir(destination, { recursive: true });
  let bytes = 0;
  for (const [key, source] of Object.entries(FULL_MODULE_COVERS)) {
    if (!/^[a-z-]+\/[a-z-]+$/.test(key) || !source.startsWith("/") || source.includes("..")) throw new Error(`Invalid cover: ${key}`);
    const file = path.join(destination, `${key.replace("/", "-")}.webp`);
    await sharp(path.join(root, "public", source)).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 70 }).toFile(file);
    bytes += (await stat(file)).size;
  }
  console.log(`${Object.keys(FULL_MODULE_COVERS).length} local thumbnails, ${Math.round(bytes / 1024)} KiB total. Original covers unchanged.`);
} finally { await server.close(); }
