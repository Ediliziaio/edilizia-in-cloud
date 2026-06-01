#!/usr/bin/env node
/**
 * audit-mobile.mjs — Audit UX/layout su viewport Android (360×800 @3x).
 *
 * Login con demo + naviga su pagine principali, esegue controlli automatici:
 *  - overflow orizzontale
 *  - touch target < 44px
 *  - testo troncato
 *  - bottom-nav clearance / safe-area
 *  - modal/sheet dentro viewport
 *
 * Output:
 *  - PNG fullPage (clip top 2000px) in docs/mobile-store-assets/screenshots/audit-android/
 *  - report markdown in docs/mobile-audit-android.md
 */

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  acc[k] = v ?? true;
  return acc;
}, {});

const BASE_URL = args.base ?? "https://app.ediliziaincloud.com";
const EMAIL = args.email ?? "demo@azienda.srl";
const PASSWORD = args.password ?? "Demo2026Azienda";
const OUTPUT_DIR = resolve("docs/mobile-store-assets/screenshots/audit-android");
const REPORT_PATH = resolve("docs/mobile-audit-android.md");

const DEVICE = {
  viewport: { width: 360, height: 800 },
  deviceScaleFactor: 3,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

const PAGES = [
  { slug: "01-cruscotto", title: "Cruscotto (Dashboard)", path: "/azienda/cruscotto" },
  { slug: "02-ordini", title: "Commesse", path: "/azienda/ordini" },
  { slug: "03-chat", title: "Silvio AI Chat", path: "/azienda/chat" },
  { slug: "04-magazzino", title: "Magazzino", path: "/azienda/magazzino" },
  { slug: "05-personale", title: "Personale", path: "/azienda/personale" },
  { slug: "06-clienti", title: "Clienti", path: "/azienda/clienti" },
  { slug: "07-fatturazione", title: "Fatturazione", path: "/azienda/fatturazione" },
];

const SKELETON_WAIT_MS = 12000;
const SETTLE_AFTER_DATA_MS = 1500;
const MAX_SHOT_HEIGHT = 2000;

const AUDIT_SCRIPT = function () {
  const VW = window.innerWidth;
  const VH = window.innerHeight;

  const cssPath = (el) => {
    if (!(el instanceof Element)) return "";
    const parts = [];
    while (el && el.nodeType === 1 && parts.length < 5) {
      let p = el.nodeName.toLowerCase();
      if (el.id) {
        p += `#${el.id}`;
        parts.unshift(p);
        break;
      }
      const cls = (el.className && typeof el.className === "string")
        ? el.className.trim().split(/\s+/).slice(0, 2).join(".")
        : "";
      if (cls) p += `.${cls}`;
      const parent = el.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.nodeName === el.nodeName);
        if (sibs.length > 1) p += `:nth-of-type(${sibs.indexOf(el) + 1})`;
      }
      parts.unshift(p);
      el = el.parentElement;
    }
    return parts.join(" > ");
  };

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    return true;
  };

  // ── 1. Overflow orizzontale
  const overflowH = [];
  document.querySelectorAll("*").forEach((el) => {
    if (!isVisible(el)) return;
    const r = el.getBoundingClientRect();
    if (el.scrollWidth > el.clientWidth + 1 && r.width > VW + 1) {
      // ignora root html/body (gestito separatamente)
      if (el === document.documentElement || el === document.body) return;
      // ignora elementi che hanno overflow:auto/scroll esplicito (sono scrollabili intenzionalmente)
      const s = getComputedStyle(el);
      const intentional = (s.overflowX === "auto" || s.overflowX === "scroll");
      overflowH.push({
        selector: cssPath(el),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        intentional,
      });
    }
  });

  // Document/body overflow (orizzontale globale)
  const docOverflow = document.documentElement.scrollWidth > VW + 1;
  const bodyOverflow = document.body.scrollWidth > VW + 1;

  // ── 2. Touch target piccoli (< 44px su uno dei lati)
  // Cerca su TUTTO il DOM (non solo viewport) per coprire contenuto scrollato
  const smallTargets = [];
  document.querySelectorAll('button, a, [role="button"], [role="tab"], [role="menuitem"], input[type="checkbox"], input[type="radio"]').forEach((el) => {
    if (!isVisible(el)) return;
    const r = el.getBoundingClientRect();
    const min = Math.min(r.width, r.height);
    if (min > 0 && min < 44) {
      smallTargets.push({
        selector: cssPath(el),
        text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40),
        w: Math.round(r.width),
        h: Math.round(r.height),
        bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      });
    }
  });

  // ── 3. Testo troncato
  const truncated = [];
  document.querySelectorAll("*").forEach((el) => {
    if (!isVisible(el)) return;
    const s = getComputedStyle(el);
    const hasEllipsis = s.textOverflow === "ellipsis" && (s.overflow === "hidden" || s.overflowX === "hidden");
    const isTruncClass = /\btruncate\b|\btext-ellipsis\b|\bline-clamp\b/.test(el.className || "");
    if ((hasEllipsis || isTruncClass) && el.scrollWidth > el.clientWidth + 1) {
      const r = el.getBoundingClientRect();
      truncated.push({
        selector: cssPath(el),
        text: (el.innerText || "").trim().slice(0, 60),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      });
    }
  });

  // ── 4. Bottom nav clearance — cerca fixed/sticky bottom elements
  const fixedBottom = [];
  document.querySelectorAll("*").forEach((el) => {
    if (!isVisible(el)) return;
    const s = getComputedStyle(el);
    if (s.position !== "fixed" && s.position !== "sticky") return;
    const r = el.getBoundingClientRect();
    // bottom-fixed: vicino al fondo del viewport
    if (r.bottom <= VH + 4 && r.bottom >= VH - 120 && r.top > VH / 2 && r.height < 120) {
      const pbStr = s.paddingBottom + " " + s.bottom + " " + s.marginBottom;
      const styleAttr = el.getAttribute("style") || "";
      fixedBottom.push({
        selector: cssPath(el),
        h: Math.round(r.height),
        offsetFromBottom: Math.round(VH - r.bottom),
        paddingBottom: s.paddingBottom,
        safeArea: /safe-area-inset-bottom|env\(\s*safe/.test(pbStr + " " + styleAttr) || /pb-safe|safe-bottom/.test(el.className || ""),
        role: el.getAttribute("role") || el.tagName.toLowerCase(),
      });
    }
  });

  // ── 5. Modal/Sheet aperti
  const dialogs = [];
  document.querySelectorAll('[role="dialog"], [data-state="open"][role="alertdialog"]').forEach((el) => {
    if (!isVisible(el)) return;
    const r = el.getBoundingClientRect();
    const outOfViewport = r.left < -1 || r.top < -1 || r.right > VW + 1 || r.bottom > VH + 1;
    dialogs.push({
      selector: cssPath(el),
      bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      outOfViewport,
    });
  });

  return {
    viewport: { w: VW, h: VH },
    overflowH: overflowH.slice(0, 20),
    docOverflow,
    bodyOverflow,
    smallTargets: smallTargets.slice(0, 30),
    truncated: truncated.slice(0, 30),
    fixedBottom,
    dialogs,
    pageHeight: document.documentElement.scrollHeight,
  };
};

async function login(page) {
  console.log(`[login] ${BASE_URL}/login`);
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  try {
    await page.fill('input[type="email"], input[name="email"], input[autocomplete="email"]', EMAIL);
    await page.fill('input[type="password"], input[name="password"], input[autocomplete="current-password"]', PASSWORD);
    await page.click('button[type="submit"], button:has-text("Accedi"), button:has-text("Login"), button:has-text("Entra")');
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    await page.waitForTimeout(2500);
    console.log("[login] ok");
  } catch (e) {
    console.warn(`[login] warn: ${e.message}`);
  }
}

async function waitContent(page) {
  await page.waitForSelector("main", { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(
    () => {
      const pulses = document.querySelectorAll(
        '[class*="animate-pulse"], [class*="skeleton"], [data-state="loading"]',
      );
      return pulses.length <= 2;
    },
    { timeout: SKELETON_WAIT_MS },
  ).catch(() => {});
  await page.waitForTimeout(SETTLE_AFTER_DATA_MS);
}

// Identifica e fa scroll dentro il principale scroll container interno
// (l'app usa un layout flex column con overflow-y:auto su main, quindi
// document.scrollHeight resta = viewport.height)
async function findInnerScrollContainerAndExpand(page) {
  return await page.evaluate(() => {
    // trova tutti gli scroll container interni con contenuto > height
    const candidates = [];
    document.querySelectorAll("*").forEach((el) => {
      const s = getComputedStyle(el);
      if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        candidates.push({ el, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
      }
    });
    // ordina per scrollHeight desc, prendi il più alto
    candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
    if (candidates.length === 0) {
      return { found: false, scrollHeight: document.documentElement.scrollHeight, clientHeight: window.innerHeight };
    }
    const top = candidates[0];
    return {
      found: true,
      tag: top.el.tagName,
      className: (top.el.className || "").toString().slice(0, 60),
      scrollHeight: top.scrollHeight,
      clientHeight: top.clientHeight,
    };
  });
}

async function captureFullPageClipped(page, outPath) {
  // Cerca lo scroll container interno (main/div con overflow-y:auto)
  const scrollInfo = await page.evaluate(() => {
    const candidates = [];
    document.querySelectorAll("*").forEach((el) => {
      const s = getComputedStyle(el);
      if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        candidates.push({ el, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
      }
    });
    candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
    if (candidates.length === 0) return null;
    // marca con un data-attr per recuperarlo
    candidates[0].el.setAttribute("data-audit-scroll", "1");
    return { scrollHeight: candidates[0].scrollHeight, clientHeight: candidates[0].clientHeight };
  });

  const pageHeight = scrollInfo
    ? scrollInfo.scrollHeight + 100 // include header/bottom nav fissi
    : await page.evaluate(() => document.documentElement.scrollHeight);
  const clipH = Math.min(pageHeight, MAX_SHOT_HEIGHT);

  // Screenshot top (con scroll a 0)
  if (scrollInfo) {
    await page.evaluate(() => {
      const el = document.querySelector("[data-audit-scroll]");
      if (el) el.scrollTop = 0;
    });
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.waitForTimeout(300);
  await page.screenshot({
    path: outPath,
    clip: { x: 0, y: 0, width: 360, height: Math.min(800, clipH) },
  });

  // Se c'è scroll interno significativo, prendi anche bottom shot
  if (scrollInfo && scrollInfo.scrollHeight > scrollInfo.clientHeight + 200) {
    const bottomPath = outPath.replace(/\.png$/, "-bottom.png");
    await page.evaluate(() => {
      const el = document.querySelector("[data-audit-scroll]");
      if (el) el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: bottomPath,
      clip: { x: 0, y: 0, width: 360, height: 800 },
    });
    // riporta su
    await page.evaluate(() => {
      const el = document.querySelector("[data-audit-scroll]");
      if (el) el.scrollTop = 0;
    });
  }
  return { pageHeight, clipH, scrollInfo };
}

// Scrolla l'inner container progressivamente e accumula audit risultati
async function auditWithScroll(page) {
  const result = await page.evaluate(async (auditFnStr) => {
    // ricostruisce la fn
    // eslint-disable-next-line no-new-func
    const runAudit = new Function("return (" + auditFnStr + ")()");
    const merged = {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      overflowH: [],
      smallTargets: [],
      truncated: [],
      fixedBottom: [],
      dialogs: [],
      docOverflow: false,
      bodyOverflow: false,
      pageHeight: document.documentElement.scrollHeight,
      innerScroll: null,
    };
    const seen = { overflow: new Set(), small: new Set(), trunc: new Set(), dlg: new Set(), fix: new Set() };

    const scrollEl = document.querySelector("[data-audit-scroll]");
    const steps = scrollEl
      ? Math.max(1, Math.ceil(scrollEl.scrollHeight / scrollEl.clientHeight))
      : 1;
    merged.innerScroll = scrollEl
      ? { scrollHeight: scrollEl.scrollHeight, clientHeight: scrollEl.clientHeight, steps }
      : null;

    for (let i = 0; i < steps; i++) {
      if (scrollEl) {
        scrollEl.scrollTop = i * scrollEl.clientHeight * 0.9;
      }
      await new Promise((r) => setTimeout(r, 250));
      const partial = runAudit();
      merged.docOverflow = merged.docOverflow || partial.docOverflow;
      merged.bodyOverflow = merged.bodyOverflow || partial.bodyOverflow;
      for (const o of partial.overflowH) {
        if (!seen.overflow.has(o.selector)) { seen.overflow.add(o.selector); merged.overflowH.push(o); }
      }
      for (const t of partial.smallTargets) {
        if (!seen.small.has(t.selector)) { seen.small.add(t.selector); merged.smallTargets.push(t); }
      }
      for (const t of partial.truncated) {
        if (!seen.trunc.has(t.selector)) { seen.trunc.add(t.selector); merged.truncated.push(t); }
      }
      for (const f of partial.fixedBottom) {
        if (!seen.fix.has(f.selector)) { seen.fix.add(f.selector); merged.fixedBottom.push(f); }
      }
      for (const d of partial.dialogs) {
        if (!seen.dlg.has(d.selector)) { seen.dlg.add(d.selector); merged.dialogs.push(d); }
      }
    }
    if (scrollEl) scrollEl.scrollTop = 0;
    return merged;
  }, AUDIT_SCRIPT.toString());
  return result;
}

async function main() {
  console.log("📱 Mobile audit Android — start");
  console.log(`base: ${BASE_URL}`);
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: DEVICE.viewport,
    deviceScaleFactor: DEVICE.deviceScaleFactor,
    userAgent: DEVICE.userAgent,
    isMobile: true,
    hasTouch: true,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  });
  const page = await context.newPage();

  await login(page);

  const results = [];
  for (const p of PAGES) {
    const url = `${BASE_URL}${p.path}`;
    console.log(`\n[audit] ${p.slug} → ${url}`);
    const entry = { ...p, url, error: null };
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await waitContent(page);

      const outPath = join(OUTPUT_DIR, `${p.slug}.png`);
      const shotInfo = await captureFullPageClipped(page, outPath);
      entry.screenshot = outPath;
      entry.pageHeight = shotInfo.pageHeight;

      // Esegui audit DOM (con scroll interno)
      const audit = await auditWithScroll(page);
      entry.audit = audit;
      console.log(`  shot: ${outPath} (page ${shotInfo.pageHeight}px)`);
      console.log(`  overflow:${audit.overflowH.length} smallTouch:${audit.smallTargets.length} truncated:${audit.truncated.length} docOverflow:${audit.docOverflow}`);
    } catch (e) {
      entry.error = e.message;
      console.warn(`  ✗ error: ${e.message}`);
    }
    results.push(entry);
  }

  await browser.close();

  // ── Genera report markdown
  const report = buildReport(results);
  await writeFile(REPORT_PATH, report, "utf-8");
  console.log(`\n✅ Report scritto: ${REPORT_PATH}`);
  console.log(`✅ Screenshots: ${OUTPUT_DIR}`);
}

function severity(entry) {
  // calcola severità per Top 10
  const issues = [];
  const a = entry.audit;
  if (!a) return issues;

  if (a.docOverflow || a.bodyOverflow) {
    issues.push({ page: entry.title, kind: "Overflow orizzontale globale", sev: "alta",
      detail: `<html> o <body> con scrollWidth > viewport (360px)`,
      fix: "Aggiungere overflow-x:hidden su body + identificare l'elemento che sfora (controlla la lista overflow per il primo selector)" });
  }
  a.overflowH.filter(o => !o.intentional).slice(0, 3).forEach((o) => {
    issues.push({ page: entry.title, kind: `Overflow non-intenzionale (${o.scrollWidth}px in ${o.clientWidth}px)`, sev: "alta",
      detail: `selector: ${o.selector} bbox=${JSON.stringify(o.bbox)}`,
      fix: "Aggiungere min-width:0 sul flex parent o max-width:100% sull'elemento, o usare truncate sui figli" });
  });
  if (a.smallTargets.length >= 3) {
    issues.push({ page: entry.title, kind: `Touch target piccoli (${a.smallTargets.length} elementi <44px)`, sev: a.smallTargets.length >= 8 ? "alta" : "media",
      detail: `prime occorrenze: ${a.smallTargets.slice(0,3).map(t => `${t.selector} (${t.w}×${t.h})`).join(" | ")}`,
      fix: "Aumentare h/w minimi a 44px (h-11 w-11) o aggiungere padding cliccabile su bottoni icona" });
  }
  if (a.truncated.length >= 3) {
    // Severità ALTA se troncamento riguarda valori monetari (€) o KPI numerici
    const hasMoney = a.truncated.some(t => /€|EUR|\d{1,3}\.\d{3}/.test(t.text || ""));
    issues.push({ page: entry.title, kind: `Testo troncato (${a.truncated.length} elementi${hasMoney ? ", incluse cifre €" : ""})`, sev: hasMoney ? "alta" : "media",
      detail: `${a.truncated.slice(0,3).map(t => `"${t.text}"`).join(" | ")}`,
      fix: hasMoney
        ? "CRITICO: valore monetario tagliato — ridurre font-size su mobile, abbreviare con notazione K/M (es. 1.35M €), o stackare label/valore in verticale"
        : "Considerare title= per tooltip nativo, o layout wrap su mobile" });
  }
  if (a.fixedBottom.length > 0) {
    const nav = a.fixedBottom[0];
    if (!nav.safeArea) {
      issues.push({ page: entry.title, kind: "Bottom nav senza safe-area-inset-bottom", sev: "media",
        detail: `${nav.selector} (h=${nav.h}px)`,
        fix: "Aggiungere padding-bottom: env(safe-area-inset-bottom) o classe pb-safe sul container fisso" });
    }
  }
  a.dialogs.filter(d => d.outOfViewport).forEach((d) => {
    issues.push({ page: entry.title, kind: "Modal/Sheet esce dal viewport", sev: "alta",
      detail: `${d.selector} bbox=${JSON.stringify(d.bbox)}`,
      fix: "Aggiungere max-w-[calc(100vw-2rem)] e max-h-[calc(100vh-2rem)] al DialogContent" });
  });
  return issues;
}

function buildReport(results) {
  const today = new Date().toISOString().slice(0, 10);
  const allIssues = results.flatMap(severity);
  const sevOrder = { alta: 0, media: 1, bassa: 2 };
  allIssues.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev]);
  const top = allIssues.slice(0, 10);

  let md = `# Mobile audit Android — ${today}\n\n`;
  md += `Viewport: 360×800 @3x (Pixel 8 Pro UA)  \n`;
  md += `Base URL: ${BASE_URL}  \n`;
  md += `Pagine auditate: ${results.length}  \n`;
  md += `Issues automatici rilevati: ${allIssues.length}\n\n`;

  md += `## Osservazioni visive aggiuntive (dalle screenshot)\n\n`;
  md += `- **Cruscotto**: header denso con 4 icone (settings, brain, chat, bell) + logo + dropdown — su 360px lo spazio per il nome azienda "Demo Azien..." è ridotto e il testo è troncato\n`;
  md += `- **Cruscotto**: dopo i filtri data (Oggi/Ieri/7 giorni/30 giorni/Mese) c'è una larga area vuota — la dashboard non scrolla, è solo header+filtri. Verificare se manca contenuto KPI sotto il fold (skeleton non risolto o layout fixed-height)\n`;
  md += `- **Commesse** (riepilogo KPI): valori monetari "1.348.666,00 €" stampati come "1.348.6…" — IMPATTO ALTO: l'utente non riesce a leggere fatturato/incassato/da incassare\n`;
  md += `- **Clienti**: i nomi clienti vengono troncati e affianco c'è il badge arancione "2 anomalie" che riduce ulteriormente lo spazio. I bottoni checkbox "Seleziona" sono 16×16 (molto sotto la soglia 44px)\n`;
  md += `- **Chat (Silvio)**: l'ultimo messaggio "Silvio: Per affrontare la questione…" è troncato a 13px font; readability bassa su Android. Considera 14px min\n`;
  md += `- **Bottom nav** (visibile in tutte le pagine): 5 voci (Home/Commesse/Silvio/Magazzino/App) — il check automatico non l'ha rilevata come fixed (probabilmente sticky in flex column). Verificare manualmente safe-area-inset-bottom su dispositivi con gesture bar\n\n`;
  md += `## Sommario — Top 10 problemi\n\n`;
  if (top.length === 0) {
    md += "Nessun problema critico rilevato (o pagine non caricate correttamente — verifica errori per pagina).\n\n";
  } else {
    top.forEach((i, idx) => {
      md += `${idx + 1}. **[${i.page}] ${i.kind}** — severità: **${i.sev}**\n`;
      md += `   - dettaglio: ${i.detail}\n`;
      md += `   - fix suggerito: ${i.fix}\n\n`;
    });
  }

  md += `## Per pagina\n\n`;
  for (const r of results) {
    md += `### ${r.title} (\`${r.path}\`)\n\n`;
    if (r.error) {
      md += `⚠️ Errore caricamento pagina: ${r.error}\n\n`;
      continue;
    }
    const a = r.audit;
    if (!a) {
      md += "Nessun dato di audit.\n\n";
      continue;
    }
    md += `- Page height: **${r.pageHeight}px**  \n`;
    md += `- Doc overflow orizzontale: **${a.docOverflow || a.bodyOverflow ? "SÌ ⚠️" : "no"}**\n\n`;

    md += `**Overflow orizzontale (${a.overflowH.length})**\n\n`;
    if (a.overflowH.length === 0) md += "_nessuno_\n\n";
    else {
      a.overflowH.slice(0, 8).forEach((o) => {
        md += `- \`${o.selector}\` — scrollW=${o.scrollWidth} clientW=${o.clientWidth} bbox=${JSON.stringify(o.bbox)}${o.intentional ? " _(scroll intenzionale)_" : ""}\n`;
      });
      md += "\n";
    }

    md += `**Touch target < 44px (${a.smallTargets.length})**\n\n`;
    if (a.smallTargets.length === 0) md += "_nessuno_\n\n";
    else {
      a.smallTargets.slice(0, 10).forEach((t) => {
        md += `- \`${t.selector}\` ${t.w}×${t.h}px${t.text ? ` — "${t.text}"` : ""}\n`;
      });
      md += "\n";
    }

    md += `**Testo troncato (${a.truncated.length})**\n\n`;
    if (a.truncated.length === 0) md += "_nessuno_\n\n";
    else {
      a.truncated.slice(0, 8).forEach((t) => {
        md += `- \`${t.selector}\` — "${t.text}" (scrollW=${t.scrollWidth} clientW=${t.clientWidth})\n`;
      });
      md += "\n";
    }

    md += `**Bottom nav / sticky bottom (${a.fixedBottom.length})**\n\n`;
    if (a.fixedBottom.length === 0) md += "_nessuna_\n\n";
    else {
      a.fixedBottom.forEach((f) => {
        md += `- \`${f.selector}\` h=${f.h}px padding-bottom=\`${f.paddingBottom}\` safe-area=${f.safeArea ? "✓" : "✗"}\n`;
      });
      md += "\n";
    }

    md += `**Modal/Dialog aperti (${a.dialogs.length})**\n\n`;
    if (a.dialogs.length === 0) md += "_nessuno_\n\n";
    else {
      a.dialogs.forEach((d) => {
        md += `- \`${d.selector}\` bbox=${JSON.stringify(d.bbox)} outOfViewport=${d.outOfViewport ? "⚠️ sì" : "no"}\n`;
      });
      md += "\n";
    }

    if (r.screenshot) {
      const rel = r.screenshot.replace(/^.*\/docs\//, "");
      md += `Screenshot: \`docs/${rel}\`\n\n`;
    }
  }

  return md;
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
