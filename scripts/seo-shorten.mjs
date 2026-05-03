/**
 * Auto-shorten title/description nei .tsx che chiamano useSEO().
 *
 * Regole:
 *   • Title > 60 char (totale visualizzato):
 *       1. rimuovo suffix " | Edilizia in Cloud" se presente
 *       2. rimuovo suffix " — Software per Imprese Edili" / " | Software …"
 *       3. se ancora > 60: tronco al " — " o " | " più vicino prima di 55 char
 *       4. se ancora > 60: tronco hard a 57 char + "…"
 *   • Description > 160 char:
 *       1. tronco all'ultimo "." prima di 155 char (mantiene frasi complete)
 *       2. fallback: tronco all'ultimo " " prima di 155 char + "…"
 *   • Description < 80 char: lascia stare (l'autore ha deciso così)
 *
 * Modifica i file in-place. Stampa report dei cambiamenti.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");
const TITLE_MAX = 60;        // <60 char totale visualizzato in SERP
const DESC_MAX = 160;        // <160 char totale visualizzato in SERP
const TITLE_SOFT = 55;
const DESC_SOFT = 155;

// Suffix ricorrenti da rimuovere automaticamente
const TITLE_SUFFIXES = [
  " | Edilizia in Cloud",
  " — Edilizia in Cloud",
  " - Edilizia in Cloud",
  " | Software per Imprese Edili",
  " — Software per Imprese Edili",
  " | Software Gestionale Edilizia",
];

function shortenTitle(title) {
  let t = title.trim();

  // 1. Rimuovi suffix ricorrente
  for (const suf of TITLE_SUFFIXES) {
    if (t.endsWith(suf)) {
      t = t.slice(0, -suf.length).trim();
      break;
    }
  }

  if (t.length <= TITLE_MAX) return t;

  // 2. Tronca al separator più vicino prima di TITLE_SOFT (55)
  const seps = [" — ", " | ", " - ", ": "];
  let best = t;
  for (const sep of seps) {
    const idx = t.lastIndexOf(sep, TITLE_SOFT);
    if (idx > 20) {
      best = t.slice(0, idx).trim();
      break;
    }
  }
  if (best.length <= TITLE_MAX) return best;

  // 3. Hard truncate
  return t.slice(0, TITLE_SOFT).replace(/\s+\S*$/, "").trim() + "…";
}

function shortenDescription(desc) {
  const t = desc.trim();
  if (t.length <= DESC_MAX) return t;

  // 1. Cerca l'ultimo "." prima di DESC_SOFT, MA solo se >= 130 char
  //    (altrimenti la description risulta troppo corta).
  const lastDot = t.lastIndexOf(".", DESC_SOFT);
  if (lastDot >= 130) {
    return t.slice(0, lastDot + 1).trim();
  }

  // 2. Fallback: tronco all'ultima parola prima di DESC_SOFT
  const trimmed = t.slice(0, DESC_SOFT).replace(/\s+\S*$/, "").trim();
  return trimmed + "…";
}

// ── Walk del filesystem per .tsx ─────────────────────────────────────────────
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Skip _deprecated, node_modules, dist
      if (entry.startsWith("_") || entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

// ── Patch un file: ritorna { changed: bool, summary: string[] } ─────────────
function patchFile(file) {
  const src = readFileSync(file, "utf-8");
  // Early exit se non c'è alcuna forma di metadata SEO
  if (
    !src.includes("useSEO(") &&
    !/\bseo:\s*\{/.test(src) &&
    !/\bseoTitle:/.test(src)
  ) {
    return { changed: false, summary: [] };
  }

  let modified = src;
  const summary = [];

  // Regex: title: "..." (non greedy, gestisce escape)
  // Catturiamo SOLO se la stringa è dentro una chiamata useSEO (heuristica: stessa funzione)
  // Per semplicità, applichiamo a tutte le occorrenze title: "..." in file con useSEO.

  // Patterns coperti:
  //   • title: "..."          → useSEO/seo:{} (default)
  //   • seoTitle: "..."       → PerTipoPageTemplate, City pages
  // E corrispondenti per description / seoDescription.
  modified = modified.replace(
    /(\b(?:title|seoTitle):\s*)("(?:[^"\\\\]|\\\\.)+")/g,
    (match, prefix, str) => {
      const original = JSON.parse(str);
      const shorter = shortenTitle(original);
      if (shorter === original) return match;
      summary.push(`title: ${original.length}→${shorter.length} char`);
      return `${prefix}${JSON.stringify(shorter)}`;
    },
  );

  modified = modified.replace(
    /(\b(?:description|seoDescription):\s*)("(?:[^"\\\\]|\\\\.)+")/g,
    (match, prefix, str) => {
      const original = JSON.parse(str);
      const shorter = shortenDescription(original);
      if (shorter === original) return match;
      summary.push(`description: ${original.length}→${shorter.length} char`);
      return `${prefix}${JSON.stringify(shorter)}`;
    },
  );

  if (modified !== src) {
    writeFileSync(file, modified, "utf-8");
    return { changed: true, summary };
  }
  return { changed: false, summary: [] };
}

function main() {
  const files = walk(SRC);
  // Includi tutti i file che hanno almeno una di queste forme di metadata SEO:
  //   • useSEO(...)            → hook diretto
  //   • seo: { ... }           → config passato a template (FeaturePageTemplate)
  //   • seoTitle: "..."        → config flat (PerTipoPageTemplate, City pages)
  const tsxWithSEO = files.filter((f) => {
    const src = readFileSync(f, "utf-8");
    return (
      src.includes("useSEO(") ||
      /\bseo:\s*\{/.test(src) ||
      /\bseoTitle:/.test(src)
    );
  });

  console.log(`▶ ${tsxWithSEO.length} file con useSEO() candidati a refactor\n`);

  let totalFiles = 0;
  let totalChanges = 0;
  for (const f of tsxWithSEO) {
    const { changed, summary } = patchFile(f);
    if (changed) {
      totalFiles++;
      totalChanges += summary.length;
      const rel = f.replace(SRC + "/", "");
      console.log(`✓ ${rel}`);
      summary.forEach((s) => console.log(`    ${s}`));
    }
  }

  console.log(`\n${totalFiles} file modificati · ${totalChanges} cambiamenti totali`);
}

main();
