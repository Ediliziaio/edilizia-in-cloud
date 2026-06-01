#!/usr/bin/env node
/**
 * fix-android-icons.mjs — Sostituisce le icone Android placeholder Capacitor
 * con il logo brand Edilizia in Cloud.
 *
 * Genera:
 *   - mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png       (legacy)
 *   - mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_round.png (legacy round)
 *   - mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_foreground.png (adaptive)
 *   - docs/mobile-store-assets/playstore-icon-512.png (per Play Console upload)
 *
 * Adaptive icon spec: foreground è 108x108dp logical, ma il visibile è
 * solo il cerchio centrale di 66dp → applichiamo padding ~33% sul foreground.
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC_LOGO = path.resolve("src/assets/edilizia-in-cloud-logo.png");
const ANDROID_RES = path.resolve("android/app/src/main/res");
const PLAYSTORE_OUT = path.resolve("docs/mobile-store-assets/playstore-icon-512.png");

const BRAND_NAVY = { r: 0x16, g: 0x28, b: 0x46, alpha: 1 };
const ICON_BG = BRAND_NAVY; // background launcher icon

// Legacy icon sizes (square — ic_launcher.png)
const LEGACY_SIZES = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

// Adaptive icon foreground sizes (108dp logical)
const FOREGROUND_SIZES = {
  "mipmap-mdpi": 108,
  "mipmap-hdpi": 162,
  "mipmap-xhdpi": 216,
  "mipmap-xxhdpi": 324,
  "mipmap-xxxhdpi": 432,
};

/**
 * Estrae il simbolo brand dal logo orizzontale e lo pulisce.
 * Il logo source è 452x... a sinistra (il simbolo), poi il wordmark.
 */
async function extractBrandSymbol(targetSize, withBackground = true) {
  // Logo è 1871x452: simbolo quadrato a sinistra ~452x452
  // Il source ha trasparenza dove "appare bianco" → flatten con WHITE per
  // ricreare l'aspetto brand (cornice navy, interno bianco, elementi navy+arancio).
  const meta = await sharp(SRC_LOGO).metadata();
  const symbolSide = meta.height; // 452

  // 1. Estrai simbolo quadrato + flatten su BIANCO (ricrea look brand)
  const symbolOnWhite = await sharp(SRC_LOGO)
    .extract({ left: 0, top: 0, width: symbolSide, height: symbolSide })
    .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .toBuffer();

  // 2. Resize alla dimensione target
  let pipeline = sharp(symbolOnWhite).resize(targetSize, targetSize, { fit: "cover" });

  return pipeline.png().toBuffer();
}

/**
 * Foreground per adaptive icon Android.
 * Specs: 108×108dp logical, ma il "safe zone" visibile (cerchio centrale)
 * è solo 66dp = 61% del lato. Tutto fuori dal safe zone può essere croppato
 * da maschere circle/squircle/teardrop.
 *
 * Strategia: padding 22% per side → simbolo occupa 56% centrale → safe.
 * Background trasparente (sopra ic_launcher_background = #162846).
 */
async function makeAdaptiveForeground(targetSize) {
  const padding = Math.round(targetSize * 0.22);
  const inner = targetSize - padding * 2;

  // Simbolo SENZA background per il foreground (resta trasparente attorno)
  const meta = await sharp(SRC_LOGO).metadata();
  const symbolSide = meta.height;

  // Per il foreground adaptive: simbolo su bianco (come look brand)
  const symbolBuf = await sharp(SRC_LOGO)
    .extract({ left: 0, top: 0, width: symbolSide, height: symbolSide })
    .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .resize(inner, inner, { fit: "cover" })
    .png()
    .toBuffer();

  // Canvas trasparente targetSize × targetSize con simbolo centrato
  return sharp({
    create: {
      width: targetSize,
      height: targetSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: symbolBuf, top: padding, left: padding }])
    .png()
    .toBuffer();
}

async function main() {
  console.log("🎨 Edilizia in Cloud — Android icons regen");
  console.log(`   Source logo: ${SRC_LOGO}`);

  // Verifica logo esiste
  try {
    await fs.access(SRC_LOGO);
  } catch {
    console.error(`❌ Logo non trovato: ${SRC_LOGO}`);
    process.exit(1);
  }

  // 1. Legacy ic_launcher.png + ic_launcher_round.png per ogni density
  for (const [folder, size] of Object.entries(LEGACY_SIZES)) {
    const dir = path.join(ANDROID_RES, folder);
    await fs.mkdir(dir, { recursive: true });

    const square = await extractBrandSymbol(size, true);
    await fs.writeFile(path.join(dir, "ic_launcher.png"), square);
    console.log(`   ✓ ${folder}/ic_launcher.png ${size}×${size}`);

    // round version: stesso contenuto (Android applica la maschera)
    await fs.writeFile(path.join(dir, "ic_launcher_round.png"), square);
    console.log(`   ✓ ${folder}/ic_launcher_round.png ${size}×${size}`);
  }

  // 2. Adaptive icon foreground
  for (const [folder, size] of Object.entries(FOREGROUND_SIZES)) {
    const dir = path.join(ANDROID_RES, folder);
    const fg = await makeAdaptiveForeground(size);
    await fs.writeFile(path.join(dir, "ic_launcher_foreground.png"), fg);
    console.log(`   ✓ ${folder}/ic_launcher_foreground.png ${size}×${size}`);
  }

  // 3. Play Store icon (512x512, opaque, no alpha)
  const playstore = await extractBrandSymbol(512, true);
  await fs.mkdir(path.dirname(PLAYSTORE_OUT), { recursive: true });
  // Forza no-alpha per Play Store
  const playstoreFlat = await sharp(playstore)
    .flatten({ background: BRAND_NAVY })
    .toColorspace("srgb")
    .png({ compressionLevel: 9 })
    .toBuffer();
  await fs.writeFile(PLAYSTORE_OUT, playstoreFlat);
  console.log(`   ✓ docs/mobile-store-assets/playstore-icon-512.png 512×512`);

  console.log("\n✅ Icone Android rigenerate.");
  console.log("   Background adaptive: dovrai aggiornare colors.xml → #162846");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
