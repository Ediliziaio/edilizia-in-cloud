#!/usr/bin/env node
/**
 * seo-sitemap-update-lastmod.mjs — v8.6.49
 *
 * Aggiorna i tag <lastmod> in public/sitemap.xml usando la data dell'ultimo
 * commit git che ha toccato la pagina corrispondente. Risolve il problema
 * "sitemap lastmod stale" (date troppo vecchie → Google riduce re-crawl).
 *
 * Mapping URL → file sorgente (best-effort):
 *   /                                  → src/pages/Home.tsx
 *   /prezzi/                           → src/pages/Prezzi.tsx
 *   /funzionalita/                     → src/pages/Funzionalita.tsx
 *   /funzionalita/calendario-lavori/   → src/pages/funzionalita/CalendarioLavori.tsx
 *   /blog/                             → src/pages/Blog.tsx
 *   /blog/<slug>/                      → blogPosts.ts (data del post se più recente)
 *   /confronto/vs-<X>/                 → src/pages/confronto/Vs<X>.tsx
 *   /per/<vertical>/                   → src/pages/per/<Vertical>.tsx
 *   /software-gestionale-edilizia-<city>/ → src/pages/city/CityLanding.tsx (tutte stesse data)
 *   /software-gestionale-edilizia/     → src/pages/city/CityHub.tsx
 *   /<legal>/                          → src/pages/<Legal>.tsx
 *
 * Esegui: node scripts/seo-sitemap-update-lastmod.mjs
 *
 * Output: aggiorna public/sitemap.xml in-place, stampa diff sintetico.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITEMAP_PATH = join(ROOT, "public/sitemap.xml");

/** Ritorna ISO date (YYYY-MM-DD) dell'ultimo commit git che ha toccato un file. */
function gitLastModified(relPath) {
  try {
    const out = execSync(`git log -1 --format=%cI -- "${relPath}"`, {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    if (!out) return null;
    return out.slice(0, 10); // YYYY-MM-DD
  } catch {
    return null;
  }
}

/** File che contengono gli articoli del blog. */
const FILE_ARTICOLI = [
  "src/data/blogPosts.ts",
  "src/data/blogPostsConfrontoDiretti.ts",
  "src/data/blogPostsConfrontoMercato.ts",
  "src/data/blogPostsNormativa.ts",
  "src/data/blogPostsPillarGestione.ts",
  "src/data/blogPostsTemplateGratis.ts",
];

/**
 * Data di modifica dichiarata DAL SINGOLO ARTICOLO (updatedAt, o publishedAt
 * se non ha mai avuto revisioni). Ritorna null se l'URL non e' un articolo o
 * se il post non viene trovato — in quel caso il chiamante torna a git.
 *
 * Serve perche' la data git del file non distingue fra articoli che stanno
 * nello stesso file: e' esattamente il caso di blogPosts.ts.
 */
function postLastModified(url) {
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "");
  if (!path.startsWith("/blog/") || path.startsWith("/blog/categoria/")) return null;
  const slug = path.replace("/blog/", "");
  if (!slug) return null;

  for (const f of FILE_ARTICOLI) {
    const abs = join(ROOT, f);
    if (!existsSync(abs)) continue;
    const src = readFileSync(abs, "utf8");
    const i = src.indexOf(`slug: "${slug}"`);
    if (i === -1) continue;
    // Il blocco del post arriva fino allo slug successivo (o a fine file).
    const next = src.indexOf('slug: "', i + 10);
    const blocco = src.slice(i, next === -1 ? src.length : next);
    const upd = blocco.match(/updatedAt:\s*"(\d{4}-\d{2}-\d{2})"/);
    if (upd) return upd[1];
    const pub = blocco.match(/publishedAt:\s*"(\d{4}-\d{2}-\d{2})"/);
    if (pub) return pub[1];
    return null;
  }
  return null;
}

/** Mappa URL canonico → path file sorgente probabile. */
function urlToSourcePath(url) {
  // Strip dominio
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/";

  // Mappe esplicite top-level
  const explicit = {
    "/": "src/pages/Home.tsx",
    "/prezzi": "src/pages/Prezzi.tsx",
    "/funzionalita": "src/pages/Funzionalita.tsx",
    "/confronto": "src/pages/Confronto.tsx",
    "/chi-siamo": "src/pages/ChiSiamo.tsx",
    "/demo": "src/pages/Demo.tsx",
    "/pianifica-migrazione": "src/pages/PianificaMigrazione.tsx",
    "/blog": "src/pages/Blog.tsx",
    "/integrazioni": "src/pages/Integrazioni.tsx",
    "/diventa-partner": "src/pages/DiventaPartner.tsx",
    "/casi-studio": "src/pages/CasiStudio.tsx",
    "/formazione": "src/pages/Formazione.tsx",
    "/glossario-edilizia": "src/pages/Glossario.tsx",
    "/software-gestionale-edilizia": "src/pages/city/CityHub.tsx",
    "/privacy-policy": "src/pages/PrivacyPolicy.tsx",
    "/termini-e-condizioni": "src/pages/TerminiECondizioni.tsx",
    "/cookie-policy": "src/pages/CookiePolicy.tsx",
    "/condizioni-utilizzo": "src/pages/CondizioniUtilizzoSito.tsx",
    "/dpa": "src/pages/DPA.tsx",
    "/avviso-legale": "src/pages/AvvisoLegale.tsx",
    "/accessibility": "src/pages/Accessibility.tsx",
  };
  if (explicit[path]) return explicit[path];

  // Dynamic patterns
  if (path.startsWith("/blog/categoria/")) return "src/pages/BlogCategory.tsx";
  if (path.startsWith("/blog/")) {
    // Gli articoli NON stanno tutti in blogPosts.ts: sono divisi su piu' file
    // (confronti diretti, confronti di mercato, normativa, pillar, template).
    // Puntare sempre al primo dava a tutti gli altri una data sbagliata — chi
    // modificava un confronto vedeva il lastmod fermo alla data di blogPosts.ts,
    // e Google continuava a considerare la pagina invariata.
    const slug = path.replace("/blog/", "").replace(/\/$/, "");
    const sorgenti = [
      "src/data/blogPosts.ts",
      "src/data/blogPostsConfrontoDiretti.ts",
      "src/data/blogPostsConfrontoMercato.ts",
      "src/data/blogPostsNormativa.ts",
      "src/data/blogPostsPillarGestione.ts",
      "src/data/blogPostsTemplateGratis.ts",
    ];
    for (const f of sorgenti) {
      const abs = join(ROOT, f);
      if (!existsSync(abs)) continue;
      if (readFileSync(abs, "utf8").includes(`"${slug}"`)) return f;
    }
    return "src/data/blogPosts.ts";
  }
  if (path.startsWith("/funzionalita/")) {
    // PascalCase from slug: /funzionalita/calendario-lavori → CalendarioLavori.tsx
    const slug = path.replace("/funzionalita/", "");
    const pascal = slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
    const direct = `src/pages/funzionalita/${pascal}.tsx`;
    if (existsSync(join(ROOT, direct))) return direct;
    // Render verticals: /funzionalita/render-bagni → render/RenderBagni
    if (slug.startsWith("render-")) {
      const renderName = "Render" + slug.replace("render-", "").split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
      return `src/pages/funzionalita/render/${renderName}.tsx`;
    }
    return "src/pages/funzionalita/_template/FunzionalitaPageTemplate.tsx";
  }
  if (path.startsWith("/confronto/vs-")) {
    const name = path.replace("/confronto/vs-", "");
    const pascal = name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
    return `src/pages/confronto/Vs${pascal}.tsx`;
  }
  if (path.startsWith("/per/")) {
    const slug = path.replace("/per/", "");
    const pascal = slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
    return `src/pages/per/${pascal}.tsx`;
  }
  if (path.startsWith("/software-gestionale-edilizia-")) {
    return "src/pages/city/CityLanding.tsx";
  }
  return null;
}

/** Main. */
function main() {
  if (!existsSync(SITEMAP_PATH)) {
    console.error("✗ sitemap.xml non trovato:", SITEMAP_PATH);
    process.exit(1);
  }

  let xml = readFileSync(SITEMAP_PATH, "utf8");

  // Match each <url>...<loc>X</loc>...<lastmod>Y</lastmod>...</url>
  const urlPattern = /(<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>)([^<]+)(<\/lastmod>)/g;

  let updated = 0;
  let skipped = 0;
  const changes = [];

  xml = xml.replace(urlPattern, (match, prefix, url, oldDate, suffix) => {
    const src = urlToSourcePath(url);
    if (!src) {
      skipped++;
      return match;
    }
    // Per gli ARTICOLI la data git del file sorgente non va bene: 74 articoli
    // vivono dentro src/data/blogPosts.ts, quindi toccarne uno solo dava a
    // tutti e 74 la stessa <lastmod> nuova. Google dichiara di ignorare i
    // lastmod quando li trova sistematicamente inaffidabili — gonfiarli
    // svaluta il segnale proprio per le pagine che sono cambiate davvero.
    // Il dato autorevole per-articolo e' il suo updatedAt (o publishedAt).
    const newDate = postLastModified(url) ?? gitLastModified(src);
    // Monotòno: una <lastmod> non deve MAI regredire (una data più vecchia
    // dice a Google "la pagina è più vecchia di prima" → riduce il re-crawl).
    // Le date ISO YYYY-MM-DD si confrontano lessicograficamente.
    if (!newDate || newDate <= oldDate) {
      skipped++;
      return match;
    }
    updated++;
    changes.push({ url, oldDate, newDate, src });
    return `${prefix}${newDate}${suffix}`;
  });

  if (updated === 0) {
    console.log("✓ Tutti i lastmod sono già aggiornati (skipped:", skipped, ")");
    return;
  }

  writeFileSync(SITEMAP_PATH, xml, "utf8");

  // Anche aggiorna il commento iniziale
  const today = new Date().toISOString().slice(0, 10);
  const commentXml = readFileSync(SITEMAP_PATH, "utf8").replace(
    /Sitemap aggiornata: \d{4}-\d{2}-\d{2}/,
    `Sitemap aggiornata: ${today}`,
  );
  writeFileSync(SITEMAP_PATH, commentXml, "utf8");

  console.log(`✓ ${updated} lastmod aggiornati (skipped: ${skipped})`);
  console.log("\nPrimi 10 cambiamenti:");
  for (const c of changes.slice(0, 10)) {
    console.log(`  ${c.url.padEnd(70)} ${c.oldDate} → ${c.newDate}`);
  }
  if (changes.length > 10) console.log(`  ...e altri ${changes.length - 10}`);
}

main();
