// Genera functions/_blog-bodies.js da src/data/blogPosts.ts.
// Uso: npx vite-node scripts/generate-blog-bodies.mjs
//
// Il file generato è il fallback "sintetico" servito ai bot quando il
// prerender Playwright non è disponibile per un /blog/<slug>. Include:
// intro, sezioni (troncate oltre BODY_CAP), liste puntate e FAQ — così anche
// il fallback resta citabile dai motori AI (AEO) e non è mai thin content.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { blogPosts } from "../src/data/blogPosts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "functions", "_blog-bodies.js");
const BODY_CAP = 900;

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const cap = (s) => (s.length > BODY_CAP ? s.slice(0, BODY_CAP).trimEnd() + "..." : s);

function renderPost(post) {
  const parts = [];
  for (const block of post.content) {
    switch (block.type) {
      case "intro":
        if (block.body) parts.push(`<p>${esc(cap(block.body))}</p>`);
        break;
      case "section":
        if (block.heading) parts.push(`<h2>${esc(block.heading)}</h2>`);
        if (block.body) parts.push(`<p>${esc(cap(block.body))}</p>`);
        break;
      case "list":
        if (block.heading) parts.push(`<h2>${esc(block.heading)}</h2>`);
        if (block.items?.length)
          parts.push(`<ul>${block.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`);
        break;
      // quote e cta esclusi dal sintetico: rumore per i motori, zero segnale.
      default:
        break;
    }
  }
  if (post.faqs?.length) {
    parts.push(`<h2>Domande frequenti</h2>`);
    for (const f of post.faqs) {
      parts.push(`<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`);
    }
  }
  return parts.join("");
}

const entries = blogPosts
  .map((p) => `  ${JSON.stringify(p.slug)}: ${JSON.stringify(renderPost(p))},`)
  .join("\n");

const file = `// AUTO-GENERATED — body sintetico blog per SSR SEO (fallback bot senza prerender)
// Rigenera con: npx vite-node scripts/generate-blog-bodies.mjs
export const BLOG_BODIES = {
${entries}
};
`;

writeFileSync(OUT, file);
console.log(`OK — ${blogPosts.length} post scritti in functions/_blog-bodies.js (${Math.round(file.length / 1024)}KB)`);
