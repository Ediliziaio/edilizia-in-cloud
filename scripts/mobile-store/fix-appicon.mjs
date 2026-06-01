#!/usr/bin/env node
/**
 * fix-appicon.mjs — iOS AppIcon 1024×1024 (Apple HIG compliant).
 *
 * Strategia v2 (post-Apple-reject):
 * - Niente crop interno → il simbolo intero del logo brand resta visibile
 * - Flatten su BIANCO (la trasparenza interna del PNG source diventa bianca)
 *   → look identico al logo che si vede su sito ediliziaincloud.com
 * - Apple applica automaticamente i propri rounded corners sopra l'icona
 * - PNG opaca, no alpha channel (requisito Apple)
 *
 * Output: ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";

const SRC = "src/assets/edilizia-in-cloud-logo.png";
const DST = "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png";
const BG = { r: 255, g: 255, b: 255, alpha: 1 }; // bianco brand

const meta = await sharp(SRC).metadata();
console.log(`Source logo: ${meta.width}×${meta.height} (${meta.channels} ch, alpha=${meta.hasAlpha})`);

// Il logo orizzontale è 1871×452: il simbolo quadrato è a sinistra ~452×452
const symbolSide = meta.height;

// 1. Estrai simbolo quadrato intero (lato sinistro) — preserva il rounded brand visibile
const symbolBuf = await sharp(SRC)
  .extract({ left: 0, top: 0, width: symbolSide, height: symbolSide })
  .toBuffer();

// 2. Resize a 1024 con flatten su BIANCO (rimuove alpha, look brand)
await sharp(symbolBuf)
  .flatten({ background: BG })
  .resize(1024, 1024, { fit: "cover" })
  .removeAlpha() // Apple richiede icona OPACA senza alpha channel
  .png({ compressionLevel: 9 })
  .toFile(DST);

// 3. Verifica metadata output
const outMeta = await sharp(DST).metadata();
console.log(`✓ AppIcon ${outMeta.width}×${outMeta.height} (${outMeta.channels} ch, alpha=${outMeta.hasAlpha})`);
console.log(`  Path: ${DST}`);

if (outMeta.hasAlpha) {
  console.warn("⚠️  WARNING: alpha channel still present — Apple rejecterà");
  process.exit(1);
}
