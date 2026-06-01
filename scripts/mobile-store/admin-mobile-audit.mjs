#!/usr/bin/env node
/**
 * admin-mobile-audit.mjs — Audit mobile pagine /admin
 *
 * 1. Apre Playwright in viewport iPhone 6.9" + Android phone
 * 2. Va su localhost:8080/admin (login page)
 * 3. Cattura screenshot baseline
 * 4. Estrae HTML per analisi struttura
 * 5. Cerca pattern problematici nei file admin del codebase
 */

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://localhost:8080";
const OUTPUT_DIR = resolve(".tmp/admin-mobile-audit");

const DEVICES = {
  iphone: {
    name: "iPhone 6.9",
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
  android: {
    name: "Android Pixel 8",
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 3,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  },
};

// Pagine da catturare. Anche se richiedono auth, lo screenshot della "auth wall" o redirect
// è utile per capire come si comporta il routing.
const PAGES = [
  { slug: "00-login", path: "/admin", description: "Entry point /admin (login o dashboard)" },
  { slug: "01-aziende", path: "/admin/aziende", description: "Lista aziende" },
  { slug: "02-cs", path: "/admin/cs", description: "Customer Success hub" },
  { slug: "03-ai", path: "/admin/ai", description: "AI hub" },
  { slug: "04-fatturato", path: "/admin/fatturato", description: "Fatturato hub" },
  { slug: "05-superadmin", path: "/admin/superadmin", description: "SuperAdmin hub" },
  { slug: "06-impostazioni", path: "/admin/impostazioni", description: "Impostazioni" },
  { slug: "07-menu", path: "/admin/menu", description: "App grid menu mobile" },
];

async function captureDevice(deviceKey) {
  const device = DEVICES[deviceKey];
  const deviceDir = join(OUTPUT_DIR, deviceKey);
  await mkdir(deviceDir, { recursive: true });

  console.log(`\n━━━ ${device.name} (${device.viewport.width}×${device.viewport.height}) ━━━`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    userAgent: device.userAgent,
    isMobile: true,
    hasTouch: true,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  });
  const page = await ctx.newPage();

  const issues = [];

  for (const p of PAGES) {
    const url = `${BASE_URL}${p.path}`;
    console.log(`[shot] ${p.slug} → ${url}`);
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(2000);

      // Screenshot
      const shotPath = join(deviceDir, `${p.slug}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      // Salva anche il full page (utile per trovare overflow)
      const fullPath = join(deviceDir, `${p.slug}-full.png`);
      await page.screenshot({ path: fullPath, fullPage: true });

      // ─── AUDIT: pattern problematici comuni ───
      const audit = await page.evaluate(() => {
        const issues = [];

        // 1. Elementi che overflowano horizontally
        const docWidth = document.documentElement.clientWidth;
        const overflowing = [];
        document.querySelectorAll("*").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.right > docWidth + 1) {
            overflowing.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className || "").toString().slice(0, 80),
              right: Math.round(r.right),
              width: Math.round(r.width),
            });
          }
        });
        if (overflowing.length > 0) {
          issues.push({
            type: "horizontal_overflow",
            count: overflowing.length,
            samples: overflowing.slice(0, 5),
          });
        }

        // 2. Touch target < 44x44 (Apple HIG)
        const smallTouch = [];
        document.querySelectorAll('button, a, [role="button"], input[type="checkbox"], input[type="radio"]').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
            const txt = (el.textContent || "").trim().slice(0, 30);
            smallTouch.push({
              tag: el.tagName.toLowerCase(),
              w: Math.round(r.width),
              h: Math.round(r.height),
              text: txt,
            });
          }
        });
        if (smallTouch.length > 0) {
          issues.push({ type: "small_touch_targets", count: smallTouch.length, samples: smallTouch.slice(0, 5) });
        }

        // 3. Testo troppo piccolo (< 12px effettivi)
        const smallText = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        let counted = 0;
        while ((node = walker.nextNode()) && counted < 200) {
          const parent = node.parentElement;
          if (!parent || parent.tagName === "SCRIPT" || parent.tagName === "STYLE") continue;
          const txt = node.textContent?.trim();
          if (!txt || txt.length < 3) continue;
          counted++;
          const style = window.getComputedStyle(parent);
          const fs = parseFloat(style.fontSize);
          if (fs > 0 && fs < 12) {
            smallText.push({
              tag: parent.tagName.toLowerCase(),
              fs: Math.round(fs * 10) / 10,
              text: txt.slice(0, 40),
            });
          }
        }
        if (smallText.length > 0) {
          issues.push({ type: "small_text", count: smallText.length, samples: smallText.slice(0, 5) });
        }

        // 4. Body scroll horizontal? (sintomo di overflow non gestito)
        const bodyScrollX = document.body.scrollWidth > document.body.clientWidth;
        if (bodyScrollX) {
          issues.push({
            type: "body_horizontal_scroll",
            body_scroll_width: document.body.scrollWidth,
            body_client_width: document.body.clientWidth,
          });
        }

        // 5. Page title + URL finale (utile per capire dove siamo)
        return {
          finalUrl: window.location.href,
          title: document.title,
          docHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          issues,
        };
      });

      console.log(`       ✓ ${shotPath}`);
      console.log(`       url finale: ${audit.finalUrl}`);
      if (audit.issues.length > 0) {
        console.log(`       ⚠️ ${audit.issues.length} categorie di problemi:`);
        for (const i of audit.issues) {
          console.log(`         - ${i.type}: ${i.count ?? "yes"}`);
        }
      }
      issues.push({ slug: p.slug, url, audit });
    } catch (e) {
      console.warn(`       ✗ ${p.slug}: ${e.message}`);
      issues.push({ slug: p.slug, url, error: e.message });
    }
  }

  await browser.close();

  // Dump report JSON
  const reportPath = join(deviceDir, "audit-report.json");
  await writeFile(reportPath, JSON.stringify(issues, null, 2));
  console.log(`\n[report] ${reportPath}`);

  return issues;
}

async function main() {
  console.log("🔍 Admin mobile audit");
  console.log(`base: ${BASE_URL}`);

  const iphone = await captureDevice("iphone");
  const android = await captureDevice("android");

  // Aggregato finale
  const summary = {
    base_url: BASE_URL,
    captured_at: new Date().toISOString(),
    iphone_pages: iphone.length,
    android_pages: android.length,
    iphone_with_issues: iphone.filter((i) => (i.audit?.issues ?? []).length > 0).map((i) => i.slug),
    android_with_issues: android.filter((i) => (i.audit?.issues ?? []).length > 0).map((i) => i.slug),
  };
  await writeFile(join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));

  console.log("\n━━━ SUMMARY ━━━");
  console.log(`iPhone pages con issues: ${summary.iphone_with_issues.join(", ") || "nessuna"}`);
  console.log(`Android pages con issues: ${summary.android_with_issues.join(", ") || "nessuna"}`);
  console.log(`\nReport completi: ${OUTPUT_DIR}/`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
