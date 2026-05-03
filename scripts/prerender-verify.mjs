/**
 * Verifica che tutti gli HTML pre-renderizzati siano "OK".
 *
 * Per ogni dist/<route>/index.html controlla:
 *   1. file size > MIN_SIZE (≥ 30 KB) — non è il guscio dello spinner
 *   2. ha un <title> diverso da quello hardcoded della homepage
 *   3. ha una meta description non vuota
 *   4. ha un <h1> nel body
 *   5. ha link[rel=canonical] coerente con la rotta
 *
 * Esce con code 0 se tutto OK, code 1 se almeno una pagina ha errori.
 * Output a colonne: rotta | size | title-len | desc-len | h1 | status
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");

// Title hardcoded dell'index.html (non deve apparire su altre rotte)
const HOMEPAGE_TITLE_FRAGMENT = "Gestionale Edilizia Cloud | Software per Imprese Edili";
// Title corretto della homepage (dopo useSEO)
const HOMEPAGE_OK_TITLE_FRAGMENT = "Gestionale Edilizia con AI";
const MIN_SIZE_BYTES = 30_000;

/** Trova ricorsivamente tutti gli index.html nella dist (max 4 livelli). */
function findAllIndexHtml(dir, depth = 0, max = 4) {
  if (depth > max) return [];
  const out = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        // Skip Vite asset directories
        if (entry.startsWith("assets") || entry === "icons" || entry === "videos" || entry === "legal") continue;
        out.push(...findAllIndexHtml(full, depth + 1, max));
      } else if (entry === "index.html") {
        out.push(full);
      }
    }
  } catch {}
  return out;
}

function extract(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

function checkFile(file) {
  const route = "/" + file.replace(DIST + "/", "").replace("/index.html", "").replace(/^index\.html$/, "");
  const normalizedRoute = route === "/index.html" ? "/" : route;
  const size = statSync(file).size;
  const html = readFileSync(file, "utf-8");

  const title = extract(html, /<title[^>]*>([^<]+)<\/title>/);
  // Use delimiter-aware regex: `content="..."` matches up to NEXT `"`, ignoring `'`.
  const desc = extract(html, /<meta[^>]+name="description"[^>]+content="([^"]*)"/);
  const ogTitle = extract(html, /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/);
  const canonical = extract(html, /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/);
  // H1: cattura tutto il contenuto fra <h1...> e </h1>, rimuove tag annidati
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : null;
  const isPrerendered = /name=["']x-prerendered["']/.test(html);

  const errors = [];
  const warnings = [];

  // 1. Size check
  if (size < MIN_SIZE_BYTES) {
    errors.push(`size ${(size / 1024).toFixed(1)}KB < ${(MIN_SIZE_BYTES / 1024).toFixed(0)}KB (probabile guscio vuoto)`);
  }

  // 2. Title check — non deve essere quello hardcoded di index.html (eccetto sulla "/")
  if (!title) {
    errors.push("title mancante");
  } else if (normalizedRoute !== "/" && title.includes(HOMEPAGE_TITLE_FRAGMENT) && !title.includes(HOMEPAGE_OK_TITLE_FRAGMENT)) {
    errors.push(`title hardcoded homepage: "${title.slice(0, 60)}…"`);
  } else if (title.length < 20) {
    warnings.push(`title troppo corto (${title.length} char)`);
  } else if (title.length > 75) {
    warnings.push(`title troppo lungo (${title.length} char)`);
  }

  // 3. Description check
  if (!desc) {
    errors.push("description mancante");
  } else if (desc.length < 80) {
    warnings.push(`description troppo corta (${desc.length} char)`);
  } else if (desc.length > 200) {
    warnings.push(`description troppo lunga (${desc.length} char)`);
  }

  // 4. H1 check
  if (!h1) {
    errors.push("h1 mancante (body vuoto?)");
  }

  // 5. og:title coerente
  if (ogTitle && title && ogTitle !== title) {
    warnings.push("og:title differente da title");
  }

  // 6. canonical
  if (!canonical) {
    warnings.push("canonical mancante");
  } else {
    const expectedPath = normalizedRoute === "/" ? "/" : normalizedRoute;
    if (!canonical.endsWith(expectedPath) && !canonical.endsWith(expectedPath + "/")) {
      warnings.push(`canonical non coerente: ${canonical}`);
    }
  }

  // 7. Marker prerender
  if (!isPrerendered) {
    warnings.push("manca marker x-prerendered (file non pre-renderizzato?)");
  }

  return {
    route: normalizedRoute,
    size,
    title,
    titleLen: title?.length ?? 0,
    descLen: desc?.length ?? 0,
    h1: h1 ? h1.slice(0, 40) : null,
    errors,
    warnings,
    isPrerendered,
  };
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n - 1) + "…" : s + " ".repeat(n - s.length);
}

function main() {
  if (!existsSync(DIST)) {
    console.error("✗ dist/ non esiste");
    process.exit(1);
  }

  const files = findAllIndexHtml(DIST);
  console.log(`▶ Verifica ${files.length} HTML pre-renderizzati\n`);

  const results = files.map(checkFile);
  const ok = results.filter((r) => r.errors.length === 0 && r.warnings.length === 0).length;
  const warn = results.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length;
  const err = results.filter((r) => r.errors.length > 0).length;
  const noPrerender = results.filter((r) => !r.isPrerendered).length;

  // Header
  console.log(
    pad("Rotta", 50) + pad("Size", 10) + pad("Title", 8) + pad("Desc", 8) + pad("H1", 6) + "Stato"
  );
  console.log("─".repeat(110));

  // Sort: errors first, then warnings, then OK
  results.sort((a, b) => {
    const sa = a.errors.length > 0 ? 0 : a.warnings.length > 0 ? 1 : 2;
    const sb = b.errors.length > 0 ? 0 : b.warnings.length > 0 ? 1 : 2;
    if (sa !== sb) return sa - sb;
    return a.route.localeCompare(b.route);
  });

  for (const r of results) {
    const status = r.errors.length > 0
      ? `❌ ${r.errors.join(", ")}`
      : r.warnings.length > 0
        ? `⚠️  ${r.warnings.join(", ")}`
        : "✅ OK";
    console.log(
      pad(r.route, 50) +
      pad((r.size / 1024).toFixed(0) + "K", 10) +
      pad(String(r.titleLen), 8) +
      pad(String(r.descLen), 8) +
      pad(r.h1 ? "✓" : "✗", 6) +
      status,
    );
  }

  console.log("─".repeat(110));
  console.log(`\nTotale: ${results.length} pagine`);
  console.log(`  ✅ OK:        ${ok}`);
  console.log(`  ⚠️  Warning:  ${warn}`);
  console.log(`  ❌ Errori:    ${err}`);
  if (noPrerender > 0) {
    console.log(`  ⚪ Senza marker prerender: ${noPrerender} (probabili HTML non rigenerati)`);
  }

  // ── Duplicate detection ──────────────────────────────────────────────────
  const titleMap = new Map();
  const descMap = new Map();
  for (const r of results) {
    if (r.title) {
      const k = r.title.trim();
      if (!titleMap.has(k)) titleMap.set(k, []);
      titleMap.get(k).push(r.route);
    }
  }
  for (const r of results) {
    if (!r.errors.length) {
      const desc = readFileSync(join(DIST, r.route === "/" ? "index.html" : r.route + "/index.html"), "utf-8")
        .match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/)?.[1];
      if (desc) {
        const k = desc.trim();
        if (!descMap.has(k)) descMap.set(k, []);
        descMap.get(k).push(r.route);
      }
    }
  }
  const dupTitles = [...titleMap.entries()].filter(([, v]) => v.length > 1);
  const dupDescs = [...descMap.entries()].filter(([, v]) => v.length > 1);

  if (dupTitles.length > 0 || dupDescs.length > 0) {
    console.log(`\n⚠️  DUPLICATI rilevati:`);
    if (dupTitles.length > 0) {
      console.log(`  • ${dupTitles.length} title duplicati:`);
      dupTitles.slice(0, 5).forEach(([t, rs]) => {
        console.log(`     "${t.slice(0, 70)}…" → ${rs.length} pagine: ${rs.slice(0, 3).join(", ")}${rs.length > 3 ? "…" : ""}`);
      });
    }
    if (dupDescs.length > 0) {
      console.log(`  • ${dupDescs.length} description duplicate:`);
      dupDescs.slice(0, 5).forEach(([d, rs]) => {
        console.log(`     "${d.slice(0, 70)}…" → ${rs.length} pagine: ${rs.slice(0, 3).join(", ")}${rs.length > 3 ? "…" : ""}`);
      });
    }
  } else {
    console.log(`\n✅ Nessun title o description duplicato (tutti unici).`);
  }

  process.exitCode = err > 0 ? 1 : 0;
}

main();
