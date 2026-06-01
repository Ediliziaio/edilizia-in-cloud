#!/usr/bin/env node
/**
 * resize-for-apple-65.mjs — Converte gli screenshot 1290x2796 (6.9") in
 * 1284x2778 (6.5") che Apple accetta come standard.
 *
 * Output: docs/mobile-store-assets/screenshots/ios-65/*.png
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC_DIR = "docs/mobile-store-assets/screenshots/ios";
const DST_DIR = "docs/mobile-store-assets/screenshots/ios-65";
const W = 1284;
const H = 2778;

async function main() {
  await fs.mkdir(DST_DIR, { recursive: true });
  const files = (await fs.readdir(SRC_DIR)).filter((f) => f.endsWith(".png"));
  for (const f of files) {
    const src = path.join(SRC_DIR, f);
    const dst = path.join(DST_DIR, f);
    await sharp(src)
      .resize(W, H, { fit: "cover", position: "center" })
      .png({ compressionLevel: 9 })
      .toFile(dst);
    console.log(`✓ ${f} → ${W}x${H}`);
  }
  console.log(`\n✅ ${files.length} screenshot pronti in ${DST_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
