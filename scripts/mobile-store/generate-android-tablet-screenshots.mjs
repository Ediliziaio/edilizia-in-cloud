#!/usr/bin/env node
/**
 * generate-android-tablet-screenshots.mjs
 * Genera screenshot tablet 7" e 10" per Google Play Store da iPhone screenshot.
 *
 * Play Store requirements:
 *   - 7"  tablet: 320-3840px, ratio 9:16 strict, max 8MB
 *   - 10" tablet: 1080-7680px, ratio 9:16 strict, max 8MB
 *
 * Strategy:
 *   - Take iPhone screenshot (1284x2778) — already vertical mobile mockup
 *   - Letterbox onto navy brand canvas at proper 9:16 aspect ratio
 *   - Output: tablet-7/* and tablet-10/* under docs/mobile-store-assets/screenshots/
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC_DIR = path.resolve("docs/mobile-store-assets/screenshots/ios-final");
const FALLBACK_DIR = path.resolve("docs/mobile-store-assets/screenshots/ios");
const OUT_7 = path.resolve("docs/mobile-store-assets/screenshots/android-tablet-7");
const OUT_10 = path.resolve("docs/mobile-store-assets/screenshots/android-tablet-10");

const BRAND_NAVY = { r: 0x16, g: 0x28, b: 0x46, alpha: 1 };

// 7" tablet: 1200x2133 (9:16)
const SIZE_7 = { w: 1200, h: 2133 };
// 10" tablet: 1600x2844 (9:16)
const SIZE_10 = { w: 1600, h: 2844 };

async function pickSourceDir() {
  try {
    const files = await fs.readdir(SRC_DIR);
    if (files.filter((f) => f.endsWith(".png")).length >= 4) return SRC_DIR;
  } catch {}
  return FALLBACK_DIR;
}

async function letterbox(srcFile, outFile, target) {
  // Resize source to fit inside target, then composite centered on navy canvas
  const fitted = await sharp(srcFile)
    .resize(target.w, target.h, {
      fit: "contain",
      background: BRAND_NAVY,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await fs.writeFile(outFile, fitted);
}

async function main() {
  console.log("📱 Generating Android tablet screenshots...");
  const srcDir = await pickSourceDir();
  console.log(`   Source: ${srcDir}`);

  await fs.mkdir(OUT_7, { recursive: true });
  await fs.mkdir(OUT_10, { recursive: true });

  const files = (await fs.readdir(srcDir))
    .filter((f) => f.endsWith(".png"))
    .sort();

  for (const f of files) {
    const src = path.join(srcDir, f);
    const out7 = path.join(OUT_7, f);
    const out10 = path.join(OUT_10, f);

    await letterbox(src, out7, SIZE_7);
    await letterbox(src, out10, SIZE_10);

    console.log(`   ✓ ${f} → 7"(${SIZE_7.w}×${SIZE_7.h}) + 10"(${SIZE_10.w}×${SIZE_10.h})`);
  }

  console.log(`\n✅ Done. Output:`);
  console.log(`   - ${OUT_7}`);
  console.log(`   - ${OUT_10}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
