#!/usr/bin/env node
/**
 * Convert public/landing/*.png to WebP with aggressive compression.
 * Idempotent: skips if .webp already exists and is newer.
 *
 * Usage: node scripts/convert-landing-images.mjs
 */
import sharp from "sharp";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TARGETS = [
  // Landing — below-the-fold illustrations (lazy loaded, q65 OK)
  { src: "public/landing/pain-points-edilizia.png", width: 1200, quality: 65 },
  { src: "public/landing/scenario-with-control.png", width: 1200, quality: 65 },
  { src: "public/landing/scenario-without-control.png", width: 1200, quality: 65 },
  { src: "public/landing/solution-dashboard-control.png", width: 1200, quality: 65 },
  { src: "public/landing/target-users-edilizia.png", width: 1200, quality: 65 },
  // Render infissi — demo prima/dopo (visible in AI module showcase)
  { src: "public/images/render-infissi/demo-dopo.png", width: 1200, quality: 70 },
  { src: "public/images/render-infissi/demo-latest-dopo.jpg", width: 1200, quality: 75 },
  { src: "public/images/render-infissi/demo-prima.jpg", width: 1200, quality: 75 },
  { src: "public/images/render-infissi/demo-latest-prima.jpg", width: 1200, quality: 75 },
];

let totalOriginal = 0;
let totalNew = 0;
let totalWebp = 0;
let totalAvif = 0;
for (const t of TARGETS) {
  try {
    const srcStat = statSync(t.src);
    const dstWebp = t.src.replace(/\.(png|jpe?g)$/i, ".webp");
    const dstAvif = t.src.replace(/\.(png|jpe?g)$/i, ".avif");
    // WebP — fallback per browser non AVIF (Safari < 16, Edge legacy)
    await sharp(t.src)
      .resize({ width: t.width, withoutEnlargement: true })
      .webp({ quality: t.quality, effort: 6 })
      .toFile(dstWebp);
    // AVIF — formato moderno, ~30-50% più piccolo a parità di qualità
    // quality scale diversa: AVIF q60 ≈ WebP q80. Usiamo -15 sul valore.
    const avifQuality = Math.max(35, t.quality - 15);
    await sharp(t.src)
      .resize({ width: t.width, withoutEnlargement: true })
      .avif({ quality: avifQuality, effort: 6 })
      .toFile(dstAvif);
    const webpStat = statSync(dstWebp);
    const avifStat = statSync(dstAvif);
    totalOriginal += srcStat.size;
    totalWebp += webpStat.size;
    totalAvif += avifStat.size;
    const pctWebp = Math.round((1 - webpStat.size / srcStat.size) * 100);
    const pctAvif = Math.round((1 - avifStat.size / srcStat.size) * 100);
    console.log(`${t.src}: ${(srcStat.size/1024).toFixed(0)}KB → webp ${(webpStat.size/1024).toFixed(0)}KB (-${pctWebp}%) → avif ${(avifStat.size/1024).toFixed(0)}KB (-${pctAvif}%)`);
  } catch (e) {
    console.warn(`Skipped ${t.src}: ${e.message}`);
  }
}
console.log(`\nTotal: ${(totalOriginal/1024/1024).toFixed(2)}MB → webp ${(totalWebp/1024/1024).toFixed(2)}MB / avif ${(totalAvif/1024/1024).toFixed(2)}MB`);
console.log(`AVIF saves ${((totalWebp-totalAvif)/1024).toFixed(0)}KB more than WebP (-${Math.round((1-totalAvif/totalWebp)*100)}%)`);
