/**
 * Prerender SPA — genera HTML statici per tutte le rotte pubbliche.
 *
 * Bug risolto:
 *   l'app è una SPA React+Vite. Cloudflare serve sempre lo stesso
 *   `dist/index.html` per QUALSIASI URL grazie al fallback `/* /index.html 200`.
 *   I crawler che NON eseguono JavaScript (ClaudeBot, GPTBot, Perplexity,
 *   Bing, anteprime social Twitter/LinkedIn/Facebook/Slack) leggono sempre
 *   il guscio della HOMEPAGE — title/meta/og/contenuti tutti uguali.
 *
 * Cosa fa questo script:
 *   1. Avvia `vite preview` in background sulla cartella dist/
 *   2. Apre un browser headless (Playwright, già installato)
 *   3. Per ogni rotta pubblica visita la URL, aspetta che React monti
 *      e che `useSEO` aggiorni l'head (marker `data-seo-applied="true"`)
 *   4. Cattura l'HTML completo del documento
 *   5. Scrive `dist/<route>/index.html`
 *
 * Cloudflare Pages servira automaticamente questi file specifici quando
 * esistono, altrimenti continuera a usare il fallback SPA per le rotte
 * private/auth-gated.
 *
 * Esegui dopo `npm run build`:
 *   npm run prerender
 */

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// ── Lista rotte pubbliche ─────────────────────────────────────────────────────
// Mantenuta in sync con src/App.tsx — esclude tutte le route auth-gated.
// Convenzione: ordinare alfabeticamente per facilitare diff in PR.
const STATIC_ROUTES = [
  "/",
  // /login NON si prerenderizza: provato il 05/09, il markup catturato a
  // 1280 px sul telefono dava CLS 0,91. Resta il primo candidato per la
  // prossima iterazione (prerender doppio mobile/desktop per UA).
  "/avviso-legale",
  "/blog",
  "/casi-studio",
  "/chi-siamo",
  "/condizioni-utilizzo",
  "/confronto",
  "/confronto/vs-buildertrend",
  "/confronto/vs-edilnet",
  "/confronto/vs-excel",
  "/confronto/vs-primus",
  "/confronto/vs-teamsystem",
  "/cookie-policy",
  "/demo",
  "/diventa-partner",
  "/dpa",
  "/formazione",
  "/funzionalita",
  "/funzionalita/agenti-ai",
  "/funzionalita/app-cantiere-mobile",
  "/funzionalita/automazioni",
  "/funzionalita/calendario-lavori",
  "/funzionalita/cassa-cantiere",
  "/funzionalita/cassetto-sdi",
  "/funzionalita/cedolini-paga",
  "/funzionalita/chat-interna",
  "/funzionalita/conserva-digitale",
  "/funzionalita/contabilita-fiscale",
  "/funzionalita/crm-edilizia",
  "/funzionalita/cruscotto-aziendale",
  "/funzionalita/ddt-digitali",
  "/funzionalita/email-marketing",
  "/funzionalita/fatturazione-elettronica",
  "/funzionalita/ferie-permessi",
  "/funzionalita/finanziamenti-cantieri",
  "/funzionalita/firma-elettronica",
  "/funzionalita/foto-cantiere",
  "/funzionalita/fotovoltaico",
  "/funzionalita/gestione-cantieri",
  "/funzionalita/gestione-subappalti",
  "/funzionalita/giornale-lavori",
  "/funzionalita/gestione-commesse",
  "/funzionalita/contabilita-lavori",
  "/funzionalita/computo-metrico",
  "/funzionalita/rapportini-cantiere",
  "/funzionalita/mezzi-attrezzature",
  "/funzionalita/direzione-lavori",
  "/funzionalita/hr-personale",
  "/funzionalita/lead-form-facebook",
  "/funzionalita/magazzino-cantiere",
  "/funzionalita/manutenzione-impianti",
  "/funzionalita/margini-cantiere",
  "/funzionalita/ordini-acquisto",
  "/funzionalita/pipeline-vendite",
  "/funzionalita/portale-clienti",
  "/funzionalita/preventivi-edilizia",
  "/funzionalita/prima-nota",
  "/funzionalita/quote-builder-ai",
  "/funzionalita/registro-iva",
  "/funzionalita/render-bagni",
  "/funzionalita/render-infissi",
  "/funzionalita/render-pavimenti",
  "/funzionalita/render-piscine",
  "/funzionalita/render-ristrutturazioni",
  "/funzionalita/render-stanza",
  "/funzionalita/render-tetti",
  "/funzionalita/report-fatturazione",
  "/funzionalita/ritenute-garanzia",
  "/funzionalita/scadenzario",
  "/funzionalita/sicurezza-cantiere",
  "/funzionalita/sms-marketing",
  "/funzionalita/tesoreria",
  "/funzionalita/ticket-assistenza",
  "/funzionalita/timbrature-gps",
  "/funzionalita/whatsapp-marketing",
  "/glossario-edilizia",
  "/integrazioni",
  "/per/commercialista-edilizia",
  "/per/fotovoltaico",
  "/per/grandi-imprese",
  "/per/impiantisti",
  "/per/imprese-edili",
  "/novita",
  "/per/medie-imprese",
  "/per/piccole-imprese",
  "/per/ristrutturatori",
  "/per/serramentisti",
  "/per/geometri",
  "/per/muratori",
  "/per/installatori",
  "/per/movimento-terra",
  "/per/cartongessisti",
  "/per/carpenteria-metallica",
  "/pianifica-migrazione",
  "/prezzi",
  "/strumenti",
  "/strumenti/calcolo-congruita-manodopera",
  "/strumenti/calcolo-costo-orario-operaio",
  "/strumenti/calcolo-ritenuta-garanzia",
  "/privacy-policy",
  "/software-gestionale-edilizia",
  // City landings — fix 2026-05-26: erano in sitemap.xml ma non prerenderate
  // → Google le vedeva come thin/empty (solo SPA shell) e le metteva in
  // "Scansionata ma non indicizzata". Ora ogni città ha HTML statico con
  // contenuto city-specific (vedi CITY_CONFIGS in src/pages/city/CityLanding.tsx).
  "/software-gestionale-edilizia-milano",
  "/software-gestionale-edilizia-roma",
  "/software-gestionale-edilizia-torino",
  "/software-gestionale-edilizia-napoli",
  "/software-gestionale-edilizia-bologna",
  "/software-gestionale-edilizia-firenze",
  "/software-gestionale-edilizia-genova",
  "/software-gestionale-edilizia-bari",
  "/software-gestionale-edilizia-verona",
  "/software-gestionale-edilizia-brescia",
  "/software-gestionale-edilizia-palermo",
  "/software-gestionale-edilizia-catania",
  "/software-gestionale-edilizia-venezia",
  "/software-gestionale-edilizia-padova",
  "/software-gestionale-edilizia-bergamo",
  "/software-gestionale-edilizia-modena",
  "/software-gestionale-edilizia-parma",
  "/software-gestionale-edilizia-salerno",
  "/software-gestionale-edilizia-trieste",
  "/software-gestionale-edilizia-cagliari",
  "/software-gestionale-edilizia-perugia",
  "/software-gestionale-edilizia-ancona",
  "/software-gestionale-edilizia-udine",
  "/software-gestionale-edilizia-messina",
  "/software-gestionale-edilizia-livorno",
  "/software-gestionale-edilizia-prato",
  "/software-gestionale-edilizia-vicenza",
  "/software-gestionale-edilizia-foggia",
  "/software-gestionale-edilizia-pescara",
  "/software-gestionale-edilizia-taranto",
  "/software-gestionale-edilizia-cosenza",
  "/software-gestionale-edilizia-trento",
  "/software-gestionale-edilizia-bolzano",
  "/software-gestionale-edilizia-ferrara",
  "/software-gestionale-edilizia-como",
  "/software-gestionale-edilizia-lecco",
  "/software-gestionale-edilizia-monza",
  "/software-gestionale-edilizia-varese",
  "/software-gestionale-edilizia-treviso",
  "/software-gestionale-edilizia-latina",
  "/software-gestionale-edilizia-pisa",
  "/software-gestionale-edilizia-reggio-emilia",
  "/software-gestionale-edilizia-reggio-calabria",
  "/strumenti/calcolatore-margine-commessa",
  "/termini-e-condizioni",
];

/** Estrae gli slug dei blog post leggendo il file sorgente con regex. */
function loadBlogSlugs() {
  // blogPosts.ts + i file batch importati con spread (i loro slug non
  // comparirebbero leggendo solo il file principale).
  const files = [
    "src/data/blogPosts.ts",
    "src/data/blogPostsNormativa.ts",
    "src/data/blogPostsTemplateGratis.ts",
    "src/data/blogPostsConfrontoMercato.ts",
    "src/data/blogPostsConfrontoDiretti.ts",
    "src/data/blogPostsPillarGestione.ts",
    "src/data/blogPostsCantierePmi.ts",
  ];
  const slugs = new Set();
  for (const rel of files) {
    const file = join(ROOT, rel);
    if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf-8");
    const re = /\bslug:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      // Skip the type definition `slug: string;`
      if (m[1] && m[1] !== "string") slugs.add(m[1]);
    }
  }
  return [...slugs];
}

/**
 * Estrae le categorie blog leggendo le KEY del CATEGORY_MAP definito in
 * src/pages/BlogCategory.tsx — non da blogPost.category, perche le key
 * sono slug curati a mano (es. "finanza-edilizia") diversi da
 * slugify("Finanza") = "finanza" che farebbe redirect a /blog.
 */
function loadBlogCategorySlugs() {
  const file = join(ROOT, "src/pages/BlogCategory.tsx");
  if (!existsSync(file)) return [];
  const src = readFileSync(file, "utf-8");
  // Match le entry di CATEGORY_MAP: "<slug>": { — richiede trattino per
  // evitare di catturare "publisher", "image", ecc. da oggetti JSON-LD inline.
  const re = /^\s*"([a-z0-9]+(?:-[a-z0-9]+)+)":\s*\{/gm;
  const cats = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    cats.add(m[1]);
  }
  return [...cats];
}

// ── Server preview helpers ───────────────────────────────────────────────────

function waitForPort(port, host = "127.0.0.1", timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const sock = net.createConnection(port, host);
      sock.once("connect", () => { sock.end(); resolve(); });
      sock.once("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`port ${port} not ready`));
        else setTimeout(tryConnect, 250);
      });
    };
    tryConnect();
  });
}

function startPreview() {
  const proc = spawn(
    "npx",
    [
      "vite", "preview",
      "--port", String(PORT),
      "--strictPort",
      "--host", "127.0.0.1",
      "--logLevel", "error",
    ],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      // detached:true crea un process group nuovo, cosi possiamo killare
      // l'INTERA progenie con process.kill(-pid). Senza questo, i child di npx
      // (esbuild, vite worker) restano zombie anche dopo SIGTERM al parent.
      detached: true,
    },
  );
  proc.stdout.on("data", (d) => process.stdout.write(`[preview] ${d}`));
  proc.stderr.on("data", (d) => process.stderr.write(`[preview-err] ${d}`));
  return proc;
}

/**
 * Killa il process group del vite preview con SIGKILL (force, non
 * cancellabile). Su Linux: process.kill(-pid) targeta tutto il PG.
 * Fallback a kill(pid) se -pid non funziona (Windows).
 */
function killPreviewHard(proc) {
  if (!proc || proc.killed) return;
  try {
    if (typeof proc.pid === "number") {
      // Process group kill (negative pid)
      try { process.kill(-proc.pid, "SIGKILL"); } catch { /* ignore */ }
    }
    // Backup: direct kill
    proc.kill("SIGKILL");
  } catch { /* ignore */ }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(DIST)) {
    console.error("✗ dist/ non esiste. Esegui prima `npm run build`.");
    process.exit(1);
  }

  // 1. Costruisci la lista completa rotte
  const blogSlugs = loadBlogSlugs();
  const categorySlugs = loadBlogCategorySlugs();
  const blogRoutes = blogSlugs.map((s) => `/blog/${s}`);
  const categoryRoutes = categorySlugs.map((s) => `/blog/categoria/${s}`);
  // PRERENDER_ONLY="/prezzi,/funzionalita" → prerender solo quelle rotte.
  // Serve a misurare una modifica in minuti invece che nei 15 di tutto il sito.
  const soloRotte = (process.env.PRERENDER_ONLY || "").split(",").map((r) => r.trim()).filter(Boolean);
  const allRoutes = [...new Set([...STATIC_ROUTES, ...blogRoutes, ...categoryRoutes])]
    .filter((r) => soloRotte.length === 0 || soloRotte.includes(r));

  console.log(`▶ Prerender ${allRoutes.length} rotte (${STATIC_ROUTES.length} statiche + ${blogRoutes.length} blog + ${categoryRoutes.length} categorie)`);

  // 2. Avvia preview server
  console.log(`▶ Avvio vite preview su :${PORT}…`);
  const preview = startPreview();
  try {
    await waitForPort(PORT);
    console.log("✓ Preview pronto");

    // 3. Avvia browser headless (con auto-install fallback se manca)
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (e) {
      const msg = String(e?.message ?? e);
      // Se Playwright e' installato ma manca il browser binario, prova install
      if (msg.includes("Executable doesn't exist") || msg.includes("playwright install")) {
        console.warn("⚠ Chromium binario non trovato, installo al volo…");
        const { execSync } = await import("node:child_process");
        try {
          execSync("npx --yes playwright install chromium-headless-shell", {
            stdio: "inherit", cwd: ROOT,
          });
        } catch {
          execSync("npx --yes playwright install chromium", {
            stdio: "inherit", cwd: ROOT,
          });
        }
        browser = await chromium.launch({ headless: true });
      } else {
        throw e;
      }
    }
    const context = await browser.newContext({
      // Simula bot-like UA — alcuni componenti potrebbero saltare
      // animazioni o tracking; va bene per il prerender.
      userAgent: "Mozilla/5.0 (compatible; PrerenderBot/1.0; +https://www.ediliziaincloud.com)",
      viewport: { width: 1280, height: 800 },
    });

    let ok = 0;
    let fail = 0;
    const failures = [];

    // Concorrenza: rendere N pagine in parallelo (4 = sweet spot per CPU/IO).
    // networkidle è troppo lento per pagine con tante immagini Unsplash;
    // usiamo "load" e poi aspettiamo manualmente useSEO + JsonLd.
    const CONCURRENCY = 4;
    const PAGE_TIMEOUT_MS = 20_000;

    async function renderRoute(route) {
      const url = `${BASE_URL}${route}`;
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "load", timeout: PAGE_TIMEOUT_MS });

        // Aspetta che useSEO abbia applicato i metadati (max 2s; fallback rapido).
        await page
          .waitForFunction(
            () => document.documentElement.getAttribute("data-seo-applied") === "true",
            { timeout: 2_000 },
          )
          .catch(async () => {
            // Pagine senza useSEO (es. NotFound) → aspetta che almeno React monti il root
            await page.waitForSelector("#root > *", { timeout: 2_000 }).catch(() => {});
          });

        // Settle per JsonLd inject + ultimi useEffect
        // La home (e ogni pagina lunga) carica le sezioni sotto la piega in
        // lazy: con 242 rotte in parallelo lo snapshot arrivava PRIMA di quei
        // chunk e la home usciva da 77 KB senza footer (contro 292 KB in un
        // run isolato) → servita così, il resto arriva dopo e sposta tutto
        // (CLS 0,20). Il <footer> è l'ultimo elemento di ogni pagina pubblica:
        // finché non c'è, la pagina non è finita. Chi non ce l'ha (404, login)
        // aspetta al massimo 8 s e prosegue.
        await page.waitForSelector("footer", { timeout: 8_000 }).catch(() => {});
        await page.waitForTimeout(150);

        let html = await page.content();
        html = html.replace(' data-seo-applied="true"', "");
        html = html.replace(
          "</head>",
          `  <meta name="x-prerendered" content="${new Date().toISOString()}">\n  </head>`,
        );

        // ── Canonicalizzazione dei link interni ───────────────────────────
        // Il canonico del sito e' www + https + BARRA FINALE, e il middleware
        // Cloudflare fa 301 su tutto il resto. I <Link to="/prezzi"> di React
        // Router pero' scrivono href SENZA barra: Googlebot li segue, prende un
        // 301 e archivia l'URL come "Pagina con reindirizzamento".
        // In Search Console erano 106 pagine, e la convalida falliva sempre
        // perche' non c'era niente da correggere lato Google: il redirect e'
        // voluto e permanente. La cura e' smettere di ESPORRE quegli URL.
        // Qui, in un punto solo, invece che nei 221 punti dove nascono.
        // Saltiamo: URL esterni, ancore, query, file con estensione, la radice.
        html = html.replace(
          /(<a\b[^>]*\shref=")(\/[^"#?]*)(")/gi,
          (match, pre, href, post) => {
            if (href === "/" || href.endsWith("/")) return match;
            if (/\.[a-z0-9]{2,8}$/i.test(href)) return match;
            if (href.startsWith("/cdn-cgi/")) return match;
            return `${pre}${href}/${post}`;
          },
        );

        // ── Safe CSS optimizations (no JS deferral, no DOM mutation) ──
        // JS loads normally so React hydrates immediately → menu, animations,
        // buttons, chat all work as expected. Only strip CSS that is truly
        // unused on marketing pages.
        //
        // 1. Strip Sonner toast CSS (~14KB) — no toasts on marketing pages
        html = html.replace(/<style(?:\s[^>]*)?>([^]*?)<\/style>/g, (match, css) => {
          if (css.includes("data-sonner")) return "";
          return match;
        });
        // 2. Strip vendor-flow CSS (xyflow, 15KB, not used on marketing)
        html = html.replace(/<link\s+rel="stylesheet"[^>]*href="[^"]*vendor-flow[^"]*\.css"[^>]*>/g, "");

        // ── 3. CSS non bloccante ────────────────────────────────────────────
        // page.content() fotografa il DOM a caricamento AVVENUTO: l'onload del
        // preload ha già trasformato rel="preload" in rel="stylesheet", i chunk
        // caricati a runtime hanno iniettato i loro <link rel="stylesheet">, e
        // Beasties aveva già annidato due <noscript> uno dentro l'altro. Servito
        // così, ogni pagina partiva con ~64 KB di CSS bloccante (Lighthouse
        // mobile: 1,1 s su /prezzi/). Si lavora SOLO sul <head>: via ogni link ai
        // fogli di build e ogni <noscript> (lì avvolgono solo quei fallback —
        // l'iframe GTM sta nel <body>), poi un preload asincrono per foglio e UN
        // fallback per chi ha JS spento.
        {
          const fine = html.indexOf("</head>");
          if (fine !== -1) {
            let head = html.slice(0, fine);
            const cssHrefs = [];
            head = head.replace(/<link\b[^>]*>/g, (tag) => {
              const h = tag.match(/\bhref="([^"]+\.css)"/);
              if (!h || !h[1].includes("/assets-cb3/")) return tag;
              if (!cssHrefs.includes(h[1])) cssHrefs.push(h[1]);
              return "";
            });
            head = head.replace(/<\/?noscript>/g, "");
            if (cssHrefs.length) {
              const preload = cssHrefs
                .map((h) => `<link rel="preload" as="style" crossorigin href="${h}" onload="this.onload=null,this.rel='stylesheet'">`)
                .join("");
              const fallback = `<noscript>${cssHrefs.map((h) => `<link rel="stylesheet" crossorigin href="${h}">`).join("")}</noscript>`;
              // Subito dopo il <title>: lo scanner del browser li vede presto,
              // prima dei blocchi inline di GA/GTM che seguono nel <head>.
              const dopoTitle = head.indexOf("</title>");
              head = dopoTitle !== -1
                ? head.slice(0, dopoTitle + 8) + preload + head.slice(dopoTitle + 8)
                : head + preload;
              html = head + fallback + html.slice(fine);
            } else {
              html = head + html.slice(fine);
            }
          }
        }

        // ROOT CAUSE FIX: route "/" non deve più sovrascrivere dist/index.html
        // (lo SHELL Vite che funziona da SPA fallback per /* in _redirects).
        // Prima: dist/index.html era la Home prerenderata da 312KB → CloudFlare
        // la serviva PER QUALSIASI route privata (/admin/*, /azienda/*) →
        // utenti vedevano la HOME PAGE flashata fino al mount di React.
        // Ora: Home prerenderata va in dist/_home/index.html, raggiunta via
        // rewrite "/ → /_home/index.html 200" in public/_redirects.
        // dist/index.html resta lo SHELL minimale per SPA fallback su route
        // dinamiche/protette.
        const outDir = route === "/"
          ? join(DIST, "_home")
          : join(DIST, route.replace(/^\//, ""));
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, "index.html"), html, "utf-8");

        ok++;
        process.stdout.write(`✓ ${route}\n`);
      } catch (e) {
        fail++;
        failures.push({ route, error: String(e?.message ?? e) });
        process.stdout.write(`✗ ${route}  ${e?.message ?? e}\n`);
      } finally {
        await page.close().catch(() => {});
      }
    }

    // 4. Esegui in batch paralleli
    const queue = [...allRoutes];
    async function worker() {
      while (queue.length > 0) {
        const r = queue.shift();
        if (r) await renderRoute(r);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    // browser.close() puo' hangare su Linux/CI: timeout esplicito 10s.
    await Promise.race([
      browser.close(),
      new Promise((r) => setTimeout(r, 10_000)),
    ]);

    // Report finale
    console.log("\n────────────────────────────────────────");
    console.log(`Prerender completato: ${ok}/${allRoutes.length} OK · ${fail} falliti`);
    if (failures.length > 0) {
      console.log("\nFalliti:");
      failures.forEach((f) => console.log(`  - ${f.route}: ${f.error}`));
    }
    if (fail > 0) process.exitCode = 1;
  } finally {
    // SIGKILL del process group (vite preview + esbuild + tutti i child)
    killPreviewHard(preview);
    // Piccolo delay per dare tempo al kernel di propagare SIGKILL prima
    // che Node esca e CF Pages chiuda lo step.
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ── Safety nets globali ──────────────────────────────────────────────────────

// 1. Hard timeout: se per QUALSIASI ragione il main() impiega > 15 minuti,
//    il processo si killa da solo. Su CF Pages (timeout build di 20 min) cosi
//    almeno lo step "Building application" non resta MAI bloccato.
const HARD_TIMEOUT_MS = 15 * 60 * 1000;
const hardTimer = setTimeout(() => {
  console.error(`✗ Hard timeout ${HARD_TIMEOUT_MS / 60000}min raggiunto — force exit`);
  process.exit(process.env.CI || process.env.CF_PAGES ? 0 : 1);
}, HARD_TIMEOUT_MS);
hardTimer.unref(); // non tiene vivo l'event loop di per se

// 2. Cleanup su qualsiasi forma di exit (Ctrl+C, kill, errore)
function cleanupAndExit(code) {
  clearTimeout(hardTimer);
  // Dato il pattern detached:true del preview, su `process.exit()` Node non
  // killa i child automaticamente. Qui non abbiamo riferimento al preview
  // ma il kill diretto e' gia in main()'s finally{}. Uscita immediata.
  process.exit(code);
}
process.on("SIGINT",  () => cleanupAndExit(130));
process.on("SIGTERM", () => cleanupAndExit(143));

main()
  .then(() => {
    clearTimeout(hardTimer);
    // Force-exit: anche dopo finally{}, alcuni handle (browser, esbuild
    // worker) possono restare aperti e bloccare l'event loop forever.
    // process.exit() chiude TUTTO senza aspettare.
    process.exit(0);
  })
  .catch((e) => {
    clearTimeout(hardTimer);
    console.error("Prerender errore fatale:", e);
    // Su CI (Cloudflare Pages, GitHub Actions) il prerender e' best-effort:
    // se fallisce non bloccare il deploy. Il sito viene servito come SPA
    // classica (perde solo il prerender SEO per questa build).
    if (process.env.CI || process.env.CF_PAGES) {
      console.warn("⚠ CI detected — exit 0 per non bloccare il deploy. SEO prerender disabilitato per questa build.");
      process.exit(0);
    } else {
      process.exit(1);
    }
  });
