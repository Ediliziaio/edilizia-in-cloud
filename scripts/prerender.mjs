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
  "/per/imprese-costruzione",
  "/per/medie-imprese",
  "/per/piccole-imprese",
  "/per/ristrutturatori",
  "/per/serramentisti",
  "/pianifica-migrazione",
  "/prezzi",
  "/privacy-policy",
  "/software-gestionale-edilizia",
  "/termini-e-condizioni",
];

/** Estrae gli slug dei blog post leggendo il file sorgente con regex. */
function loadBlogSlugs() {
  const file = join(ROOT, "src/data/blogPosts.ts");
  if (!existsSync(file)) return [];
  const src = readFileSync(file, "utf-8");
  const re = /\bslug:\s*"([^"]+)"/g;
  const slugs = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    // Skip the type definition `slug: string;`
    if (m[1] && m[1] !== "string") slugs.add(m[1]);
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
  const allRoutes = [...new Set([...STATIC_ROUTES, ...blogRoutes, ...categoryRoutes])];

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
        await page.waitForTimeout(150);

        let html = await page.content();
        html = html.replace(' data-seo-applied="true"', "");
        html = html.replace(
          "</head>",
          `  <meta name="x-prerendered" content="${new Date().toISOString()}">\n  </head>`,
        );

        const outDir = route === "/" ? DIST : join(DIST, route.replace(/^\//, ""));
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
