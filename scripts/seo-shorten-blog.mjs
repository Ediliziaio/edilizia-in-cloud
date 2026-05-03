/**
 * Auto-shorten title + excerpt nei 54 blog post di src/data/blogPosts.ts.
 *
 * I blog post sono passati direttamente a useSEO via post.title / post.excerpt
 * — quindi seguono le stesse regole degli altri title/description.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "src/data/blogPosts.ts");

const TITLE_MAX = 60;
const TITLE_SOFT = 55;
const DESC_MAX = 160;
const DESC_SOFT = 155;

function shortenTitle(title) {
  let t = title.trim();
  if (t.length <= TITLE_MAX) return t;
  // Tronca al separator
  const seps = [" — ", " | ", ": ", " - "];
  for (const sep of seps) {
    const idx = t.lastIndexOf(sep, TITLE_SOFT);
    if (idx > 20) return t.slice(0, idx).trim();
  }
  // Hard truncate to last word boundary before TITLE_SOFT
  return t.slice(0, TITLE_SOFT).replace(/\s+\S*$/, "").trim() + "…";
}

function shortenExcerpt(excerpt) {
  const t = excerpt.trim();
  if (t.length <= DESC_MAX) return t;
  // Tronca all'ultimo "." prima di DESC_SOFT, MA solo se >= 130 char
  // (altrimenti la description diventa troppo corta, sotto-utilizza spazio SERP).
  const lastDot = t.lastIndexOf(".", DESC_SOFT);
  if (lastDot >= 130) return t.slice(0, lastDot + 1).trim();
  return t.slice(0, DESC_SOFT).replace(/\s+\S*$/, "").trim() + "…";
}

let src = readFileSync(FILE, "utf-8");
const STR_RE = `"(?:[^"\\\\]|\\\\.)+"`;

let changedTitles = 0;
let changedExcerpts = 0;

src = src.replace(
  new RegExp(`(\\btitle:\\s*)(${STR_RE})`, "g"),
  (match, prefix, str) => {
    const original = JSON.parse(str);
    const shorter = shortenTitle(original);
    if (shorter === original) return match;
    changedTitles++;
    return `${prefix}${JSON.stringify(shorter)}`;
  },
);

src = src.replace(
  new RegExp(`(\\bexcerpt:\\s*)(${STR_RE})`, "g"),
  (match, prefix, str) => {
    const original = JSON.parse(str);
    const shorter = shortenExcerpt(original);
    if (shorter === original) return match;
    changedExcerpts++;
    return `${prefix}${JSON.stringify(shorter)}`;
  },
);

writeFileSync(FILE, src, "utf-8");
console.log(`✓ blogPosts.ts: ${changedTitles} title accorciati · ${changedExcerpts} excerpt accorciati`);
