#!/usr/bin/env node
/**
 * capture-screenshots.mjs — Genera screenshot per Apple App Store + Google Play.
 *
 * Output:
 *   docs/mobile-store-assets/screenshots/ios/    iPhone 6.9" (1290x2796)
 *   docs/mobile-store-assets/screenshots/android/ Phone (1080x2400)
 *
 * Strategia:
 *   - Lancia Chromium con viewport mobile + deviceScaleFactor 3 (Retina)
 *   - Logga con demo@azienda.srl / Demo2026Azienda
 *   - Naviga su 6 pagine chiave
 *   - Aspetta network idle + selettori "content ready"
 *   - Salva PNG
 *
 * Uso:
 *   node scripts/mobile-store/capture-screenshots.mjs
 *   node scripts/mobile-store/capture-screenshots.mjs --base=https://app.ediliziaincloud.com
 *   node scripts/mobile-store/capture-screenshots.mjs --platform=ios   # solo iOS
 *
 * Default base: https://app.ediliziaincloud.com (cambia se la produzione è altra)
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

// ─── Config ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  acc[k] = v ?? true;
  return acc;
}, {});

const BASE_URL = args.base ?? "https://app.ediliziaincloud.com";
const EMAIL = args.email ?? "demo@azienda.srl";
const PASSWORD = args.password ?? "Demo2026Azienda";
const PLATFORM = args.platform ?? "both"; // ios | android | both
const OUTPUT_DIR = resolve("docs/mobile-store-assets/screenshots");

const DEVICES = {
  // iPhone 17 Pro Max — Apple richiede 6.9" obbligatorio (alternativo 6.5")
  ios: {
    name: "iPhone 6.9",
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3, // 430*3 = 1290, 932*3 = 2796 → exact spec Apple
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    outputDir: join(OUTPUT_DIR, "ios"),
  },
  // Android phone — Google Play vuole min 1080px lato corto
  android: {
    name: "Android Phone",
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 3, // 360*3 = 1080, 800*3 = 2400 → ok Play
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    outputDir: join(OUTPUT_DIR, "android"),
  },
};

// Le 6 pagine da catturare — adatta i path al routing reale dell'app
const PAGES = [
  {
    slug: "01-dashboard",
    title: "Dashboard cantieri",
    path: "/azienda",
    waitFor: "h1, [data-testid='dashboard-title'], main",
    description: "Vista d'insieme attività",
  },
  {
    slug: "02-cantieri-list",
    title: "Lista cantieri",
    path: "/azienda/cantieri",
    waitFor: "main",
    description: "I tuoi cantieri attivi",
  },
  {
    slug: "03-commesse",
    title: "Commesse e marginalità",
    path: "/azienda/ordini",
    waitFor: "main",
    description: "Margine in tempo reale",
  },
  {
    slug: "04-silvio-chat",
    title: "Silvio AI assistente",
    path: "/azienda/chat",
    waitFor: "main",
    description: "AI sempre disponibile",
  },
  {
    slug: "05-personale",
    title: "Personale e timbrature",
    path: "/azienda/personale",
    waitFor: "main",
    description: "Operai, ore, presenze",
  },
  {
    slug: "06-fatturato",
    title: "Fatturato",
    path: "/azienda/fatturato",
    waitFor: "main",
    description: "Cassa, pagamenti, scadenze",
  },
];

// ─── Main ───────────────────────────────────────────────────────────────────
async function captureForDevice(device) {
  console.log(`\n━━━ ${device.name} ━━━`);
  console.log(
    `viewport ${device.viewport.width}×${device.viewport.height} ` +
      `×${device.deviceScaleFactor} = ` +
      `${device.viewport.width * device.deviceScaleFactor}×${
        device.viewport.height * device.deviceScaleFactor
      }`,
  );

  await mkdir(device.outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    userAgent: device.userAgent,
    isMobile: true,
    hasTouch: true,
    // Italiano per la demo (numeri, date)
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  });
  const page = await context.newPage();

  // 1. Login
  console.log(`[login] ${BASE_URL}/login`);
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });

  // Selettori generici — adatta se i tuoi sono diversi
  try {
    await page.fill('input[type="email"], input[name="email"], input[autocomplete="email"]', EMAIL);
    await page.fill(
      'input[type="password"], input[name="password"], input[autocomplete="current-password"]',
      PASSWORD,
    );
    await page.click(
      'button[type="submit"], button:has-text("Accedi"), button:has-text("Login"), button:has-text("Entra")',
    );
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    await page.waitForTimeout(2000); // safety per redirect dopo login
  } catch (e) {
    console.warn(`[login] fallito (${e.message}). Provo a procedere — potresti già essere loggato.`);
  }

  // 2. Cattura ogni pagina
  for (const p of PAGES) {
    const url = `${BASE_URL}${p.path}`;
    console.log(`[shot] ${p.slug} → ${url}`);
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      // Aspetta che il contenuto principale sia visibile
      await page.waitForSelector(p.waitFor, { timeout: 15000 });
      await page.waitForTimeout(1500); // assestamento animazioni
      // Scrolla in alto (sanity)
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      const outPath = join(device.outputDir, `${p.slug}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`       ✓ ${outPath}`);
    } catch (e) {
      console.warn(`       ✗ ${p.slug}: ${e.message}`);
    }
  }

  await browser.close();
  console.log(`[done] ${device.name} → ${device.outputDir}`);
}

async function main() {
  console.log("📱 Mobile store screenshot capture");
  console.log(`base: ${BASE_URL}`);
  console.log(`user: ${EMAIL}`);
  console.log(`platform: ${PLATFORM}`);

  if (PLATFORM === "ios" || PLATFORM === "both") {
    await captureForDevice(DEVICES.ios);
  }
  if (PLATFORM === "android" || PLATFORM === "both") {
    await captureForDevice(DEVICES.android);
  }

  console.log("\n✅ Tutto pronto. Apri le cartelle:");
  console.log(`   docs/mobile-store-assets/screenshots/ios/`);
  console.log(`   docs/mobile-store-assets/screenshots/android/`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
