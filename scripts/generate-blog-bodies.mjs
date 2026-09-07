// Genera functions/_blog-bodies.js e functions/_blog-meta.js da src/data/blogPosts.ts.
// Uso: npx vite-node scripts/generate-blog-bodies.mjs
//
// _blog-bodies.js: il corpo "sintetico" servito ai bot quando il prerender
// Playwright non è disponibile per un /blog/<slug>. Include intro, sezioni
// (troncate oltre BODY_CAP), liste puntate e FAQ — così anche il fallback
// resta citabile dai motori AI (AEO) e non è mai thin content.
//
// _blog-meta.js: titolo, descrizione, data, copertina, tag e categoria di OGNI
// post. Prima questi dati vivevano scritti a mano dentro _middleware.js
// (BLOG_POST_META / BLOG_POST_CATEGORY) e si fermavano a 66 post: i 24 dei
// file batch (Normativa, TemplateGratis, ConfrontoDiretti, ...) esistevano
// come pagine ma nessuna pagina vista da Googlebot li linkava — orfani dal
// giorno in cui sono usciti. Ora un post nuovo entra nell'archivio, nella sua
// categoria e nei correlati semplicemente rilanciando questo script.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { blogPosts } from "../src/data/blogPosts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_BODIES = join(ROOT, "functions", "_blog-bodies.js");
const OUT_META = join(ROOT, "functions", "_blog-meta.js");
const BODY_CAP = 900;
const SITE_URL = "https://www.ediliziaincloud.com";

// Le stesse chiavi di CATEGORY_MAP in src/pages/BlogCategory.tsx: la pagina
// /blog/categoria/<slug> esiste solo per queste.
const CATEGORY_SLUG = {
  "Gestione Cantieri": "gestione-cantieri",
  Finanza: "finanza-edilizia",
  "HR & Personale": "hr-personale",
  Marketing: "marketing-edilizia",
  Commerciale: "commerciale-edilizia",
  Digitalizzazione: "digitalizzazione-edilizia",
  Normativa: "normativa-edilizia",
};

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

// Stessa regola di useSEO (src/hooks/useSEO.ts): il suffisso si aggiunge solo
// se il titolo non contiene già il brand e resta sotto i 60 caratteri. Così il
// <title> che vede Googlebot nel fallback è identico a quello del prerender.
const SUFFIX = " | Edilizia in Cloud";
const seoTitle = (title) =>
  title.includes("Edilizia in Cloud") || title.length + SUFFIX.length > 60 ? title : `${title}${SUFFIX}`;

const absolute = (src) => (src.startsWith("http") ? src : `${SITE_URL}${src}`);

function metaFor(post) {
  const category = CATEGORY_SLUG[post.category];
  if (!category) {
    throw new Error(
      `Post "${post.slug}": categoria "${post.category}" sconosciuta. Aggiungila a CATEGORY_SLUG (e a CATEGORY_MAP in BlogCategory.tsx).`,
    );
  }
  return {
    title: seoTitle(post.title),
    h1: post.title,
    description: post.excerpt,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt ?? post.publishedAt,
    coverImage: absolute(post.coverImage),
    tags: post.tags ?? [],
    category,
  };
}

const seen = new Set();
for (const p of blogPosts) {
  if (seen.has(p.slug)) throw new Error(`Slug duplicato nel blog: ${p.slug}`);
  seen.add(p.slug);
}

const bodyEntries = blogPosts
  .map((p) => `  ${JSON.stringify(p.slug)}: ${JSON.stringify(renderPost(p))},`)
  .join("\n");

const bodiesFile = `// AUTO-GENERATED — body sintetico blog per SSR SEO (fallback bot senza prerender)
// Rigenera con: npx vite-node scripts/generate-blog-bodies.mjs
export const BLOG_BODIES = {
${bodyEntries}
};
`;

const metaEntries = blogPosts
  .map((p) => `  ${JSON.stringify(p.slug)}: ${JSON.stringify(metaFor(p))},`)
  .join("\n");

const categoryEntries = blogPosts
  .map((p) => `  ${JSON.stringify(p.slug)}: ${JSON.stringify(CATEGORY_SLUG[p.category])},`)
  .join("\n");

const metaFile = `// AUTO-GENERATED — metadati di ogni post del blog per il middleware SEO.
// Rigenera con: npx vite-node scripts/generate-blog-bodies.mjs
// Fonte: src/data/blogPosts.ts (e i file batch che importa). Non modificare a mano.
export const BLOG_POST_META = {
${metaEntries}
};

// slug → categoria (pagine /blog/categoria/* + correlati nei post)
export const BLOG_POST_CATEGORY = {
${categoryEntries}
};
`;

writeFileSync(OUT_BODIES, bodiesFile);
writeFileSync(OUT_META, metaFile);
console.log(
  `OK — ${blogPosts.length} post: functions/_blog-bodies.js (${Math.round(bodiesFile.length / 1024)}KB) + functions/_blog-meta.js (${Math.round(metaFile.length / 1024)}KB)`,
);
