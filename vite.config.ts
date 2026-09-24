import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import Beasties from "beasties";
import { minify as htmlMinify } from "html-minifier-terser";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// https://vitejs.dev/config/
const isMobile = process.env.VITE_APP_MODE === "mobile";
export default defineConfig(() => ({
  server: {
    host: "::",
    port: process.env.PORT ? parseInt(process.env.PORT) : 8080,
    hmr: {
      overlay: false,
    },
  },
  preview: {
    host: "::",
    // Onora la porta assegnata dall'harness (PORT env) per evitare conflitti
    // quando 4173 è già occupata da un'altra preview; fallback al default vite.
    port: process.env.PORT ? parseInt(process.env.PORT) : 4173,
  },
  define: {
    __APP_MODE__: JSON.stringify(process.env.VITE_APP_MODE || "full"),
  },
  plugins: [
    react(),
    // v8.6.109 — Defer del CSS principale per migliorare FCP/LCP mobile.
    // Il bundle CSS index-*.css e' ~382KB (~50KB gzip) e blocca il rendering
    // iniziale (PSI flaggava 'Richieste di blocco del rendering' -160ms).
    // Plugin custom che trasforma <link rel="stylesheet"> in:
    //   <link rel="preload" as="style" onload="this.onload=null;this.rel='stylesheet'">
    // + <noscript> fallback per safety.
    // Skippa CSS gia minimal o critici (non c'e nessuno per ora, ma e' future-proof).
    {
      name: "defer-non-critical-css",
      apply: "build",
      transformIndexHtml: {
        order: "post" as const,
        handler(html: string) {
          // v8.6.124 — Strip lazy chunk CSS preloads dal HTML iniziale.
          //
          // Rolldown/Vite emette `<link rel="stylesheet">` per OGNI CSS
          // raggiungibile dal grafo, anche se via lazy import. Sulla landing
          // pubblica questo significava preloadare 15KB di xyflow CSS
          // (chunk page-azienda-marketing-other) usato SOLO su /azienda/
          // marketing/automations — pure spreco di banda critical path.
          //
          // Strategia:
          //  1. Rimuovo i link CSS dei chunks lazy (tutti tranne l'index-*).
          //     Quel CSS sarà importato dinamicamente quando il JS lazy del
          //     chunk viene caricato (Vite genera l'import "use server"-style
          //     nei chunks JS che hanno CSS associato).
          //  2. Sull'index-*.css principale (eager, bundle CSS app) lo trasformo
          //     in preload async (non-blocking) per non bloccare il rendering
          //     iniziale.
          const allMatches = [...html.matchAll(/<link\s+rel="stylesheet"\s+crossorigin\s+href="([^"]+)"\s*\/?>/g)];
          const stripped: string[] = [];
          const transformed: string[] = [];
          let out = html;
          for (const m of allMatches) {
            const href = m[1];
            const fullTag = m[0];
            const isEntry = /\/assets-cb3\/index-[^/]+\.css$/.test(href);
            if (!isEntry) {
              // RIMUOVI: chunk CSS lazy. Sarà caricato dal JS lazy.
              out = out.replace(fullTag, "");
              stripped.push(href);
            } else {
              // TRANSFORM: entry CSS → preload async.
              out = out.replace(
                fullTag,
                `<link rel="preload" as="style" crossorigin href="${href}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" crossorigin href="${href}"></noscript>`,
              );
              transformed.push(href);
            }
          }
          if (stripped.length || transformed.length) {
            console.log(`[defer-css] stripped ${stripped.length} lazy CSS preload(s), deferred ${transformed.length} entry CSS`);
          }
          return out;
        },
      },
    },
    // v8.6.121 — Critical CSS auto-extraction via Beasties (post-build hook).
    // Estrae automaticamente le regole CSS usate above-the-fold dell'HTML
    // generato e le INLINE nello <style> dell'<head>. Il bundle CSS principale
    // (388KB) resta async (preload+onload→stylesheet via defer-non-critical-css).
    // Effetto atteso: -2s su LCP mobile, +10-15 punti PageSpeed.
    {
      name: "beasties-critical-css",
      apply: "build",
      enforce: "post" as const,
      async closeBundle() {
        try {
          // v8.6.126 — Beasties tuning più aggressivo per prerendered routes
          // /prezzi /funzionalita /blog. Prima inlinava ~50-60KB di critical CSS
          // (le regole Tailwind effettivamente usate nel DOM completo prerender),
          // gonfiando HTML a 194KB. Ora pruneSource: true + critical only.
          const beasties = new Beasties({
            path: path.resolve(__dirname, "dist"),
            publicPath: "/",
            preload: "swap",
            inlineFonts: false,
            pruneSource: false, // mantieni CSS originali (per below-fold)
            mergeStylesheets: false,
            additionalStylesheets: [],
            compress: true,
            logLevel: "info",
            // Solo le regole CRITICHE above-the-fold: niente media queries di
            // viewport non-mobile, niente :hover (utente che fa hover ha già
            // CSS caricato), niente animation più di base.
            // Con inlineFonts false riduce anche gli <style> scritti a mano in
            // index.html e toglie le @font-face: per questo quelle di Inter stanno
            // in src/index.css (dal 24/09/2026; dal 22/05 Inter non si vedeva).
            // Non spegnerlo: il blocco scritto a mano ha anche .hidden{display:none},
            // che intero, nelle pagine prerenderizzate, viene DOPO il foglio e
            // batte lg:flex (menu in alto sparito su computer).
            reduceInlineStyles: true,
            keyframes: "critical",
            allowRules: [
              /^@font-face/,
              /^:root/,
              /^html/,
              /^body/,
            ],
            // v8.6.128 (F4) — Beasties tuning più aggressivo.
            // Threshold abbassato da 8192 → 4096 byte. Su prerendered routes
            // (blog/, prezzi/, funzionalita/) Beasties stava inline-ando ~60-90KB
            // di critical CSS, gonfiando l'HTML a 173/167/126KB raw.
            // Con 4KB threshold solo il CSS DAVVERO critico above-the-fold viene
            // inline-ato, il resto va nel bundle deferito (già preload async).
            // Atteso: -50KB raw su /blog/, -40KB raw su /prezzi/, -25KB raw su /funzionalita/.
            inlineThreshold: 4096,
          });

          // Funzione ricorsiva per trovare tutti gli index.html generati
          function* findHtmlFiles(dir: string): Generator<string> {
            const entries = readdirSync(dir);
            for (const entry of entries) {
              const full = join(dir, entry);
              if (statSync(full).isDirectory()) {
                // Skip assets / icons / images dir
                if (["assets-cb3", "assets-cb2", "assets-cb1", "assets", "icons", "images", "_routes"].includes(entry)) continue;
                yield* findHtmlFiles(full);
              } else if (entry.endsWith(".html")) {
                yield full;
              }
            }
          }

          const distDir = path.resolve(__dirname, "dist");
          let processed = 0;
          let bytesSaved = 0;
          for (const htmlFile of findHtmlFiles(distDir)) {
            try {
              const html = readFileSync(htmlFile, "utf-8");
              // 1. Beasties: critical CSS extraction
              let processedHtml = await beasties.process(html);
              // 2. v8.6.126 — HTML minify: strip whitespace + comment, attr shorthand
              //    Sicuro: preserva JSON-LD, conditional comments, script content.
              //    Riduce ~5-15% sul peso HTML (specie prerendered routes 150-200KB).
              const sizeBefore = processedHtml.length;
              processedHtml = await htmlMinify(processedHtml, {
                collapseWhitespace: true,
                collapseInlineTagWhitespace: false,
                removeComments: true,
                ignoreCustomComments: [/^!/, /^\s*v8\.6/], // preserva commenti versione
                minifyCSS: true,
                minifyJS: true, // v8.6.127 — Minifica inline scripts (SW recovery, GA4, canonical). Vite non li tocca perché sono nell'HTML statico, non nei moduli ES. Terser li riduce ~40% (-3-5KB per file).
                removeAttributeQuotes: false, // più sicuro, no problemi parsing
                removeRedundantAttributes: true,
                removeScriptTypeAttributes: false, // serve type="speculationrules"
                removeStyleLinkTypeAttributes: true,
                sortAttributes: false,
                sortClassName: false,
                useShortDoctype: true,
                preserveLineBreaks: false,
              });
              bytesSaved += sizeBefore - processedHtml.length;
              writeFileSync(htmlFile, processedHtml);
              processed += 1;
            } catch (e) {
              console.warn(`[beasties] skip ${htmlFile}: ${(e as Error).message}`);
            }
          }
          console.log(`[beasties+minify] processed ${processed} HTML file(s), saved ${(bytesSaved/1024).toFixed(1)} KB`);
        } catch (e) {
          console.error(`[beasties] failed: ${(e as Error).message}`);
        }
      },
    },
    ...(isMobile ? [] : [VitePWA({
      registerType: "autoUpdate",
      // Do not inject /registerSW.js. With the current Vite/Rolldown build the
      // external register file can be referenced without being emitted, causing
      // a production MIME error on first load. Keep the generated SW available,
      // but let the app opt into registration explicitly later.
      injectRegister: false,
      includeAssets: ["favicon.ico", "robots.txt", "icons/apple-touch-icon.png"],
      // The app already ships public/manifest.json. Disabling plugin manifest
      // injection avoids an extra /manifest.webmanifest reference that was not
      // emitted under Rolldown.
      manifest: false,
      // ─────────────────────────────────────────────────────────────
      // 🚨 SELF-DESTROYING SW (2026-04-26)
      //
      // I deploy precedenti hanno installato sui device degli utenti un SW
      // Workbox con `precacheAndRoute` + `NavigationRoute(createHandlerBound
      // ToURL("index.html"))` e un `runtimeCaching` catch-all che intercettava
      // anche `/auth/v1/token`. Su iOS Safari questo combinato:
      //   1. Serviva index.html stale dalla precache dopo un nuovo deploy →
      //      gli utenti restavano per sempre sul vecchio HTML, NON ricevevano
      //      mai i fix in commit successivi (incluso il fix `sw_reset_v9`).
      //   2. Intercettava il POST di login con NetworkFirst senza
      //      networkTimeoutSeconds → "Accesso in corso..." infinito.
      //
      // `selfDestroying: true` fa generare a vite-plugin-pwa un sw.js minimale
      // che, all'`activate`, esegue `self.registration.unregister()` + svuota
      // tutte le `caches` + ricarica tutti i client. Quando il browser fa il
      // periodic update-check del vecchio SW e scarica il nuovo sw.js (che è
      // SEMPRE servito dal network, mai dalla cache, per spec), il nuovo SW
      // si installa, si auto-distrugge, e libera definitivamente il device.
      //
      // Da qui in poi:
      //   • niente più SW = niente più intercettazione di auth/functions
      //   • niente più precache di index.html = utenti ricevono SEMPRE il
      //     nuovo HTML al primo refresh post-deploy
      //   • Cloudflare CDN gestisce il caching degli asset (immutable hashed)
      //
      // Questa è una soluzione duratura, non una toppa: il PWA potrà essere
      // reintrodotto in futuro con una config minimale (solo precache icone)
      // se mai servirà di nuovo. Ad oggi non porta valore commisurato al
      // rischio di ricreare lo stesso bug.
      // ─────────────────────────────────────────────────────────────
      // 2026-09-06: SW riacceso, ma con regole minime e sicure (vedi runtimeCaching):
      // niente precache di index.html, niente cache delle API. Serve all'area campo
      // (shell offline) e alle Web Push, che senza SW non possono esistere.
      selfDestroying: false,
      workbox: {
        // sw-push-handler.js: gestione eventi push Web Push API (MP5)
        // Incluso via importScripts nel SW generato da Vite PWA.
        importScripts: ["/sw-push-handler.js"],
        // Only precache icons, images and fonts — NOT JS/CSS bundles.
        // JS/CSS chunks already have content-hash filenames and are cached
        // by Cloudflare edge (immutable, 1 year). Precaching them in the SW
        // causes stale-cache blank-page crashes whenever a new deploy ships.
        // ESCLUDIAMO /templates/** dal precache: sono asset opzionali (foto
        // template gallery, ~200KB per il pacchetto Serramenti) caricati on
        // demand solo dal picker. Cloudflare CDN li serve già velocemente.
        // Pattern globale + esclusione esplicita /templates/** (foto picker).
        globPatterns: ["**/*.{ico,svg,woff2}", "icons/**/*.png", "apple-touch-icon.png"],
        globIgnores: ["**/templates/**", "**/img/**"],
        // NO navigateFallback: Cloudflare Pages handles SPA routing server-side
        // via _redirects (/* /index.html 200). Caching index.html in the SW
        // causes stale chunk-hash references after deploys → "Failed to fetch
        // dynamically imported module" loop. Let navigation always hit the network
        // so the browser always gets the fresh index.html with correct chunk hashes.
        cleanupOutdatedCaches: true,
        // skipWaiting: true — force the new SW to take over immediately.
        // The old SW had NetworkFirst for assets which poisoned the assets-runtime
        // cache (Cloudflare mid-deploy served index.html for JS chunk URLs).
        // The new SW has NO runtimeCaching for assets so the poisoned cache is
        // never consulted — safe to skipWaiting now that the root cause is removed.
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Shell dell'area campo: rete prima (HTML sempre fresco quando c'è
            // linea), cache SOLO se la rete non risponde in 4 s. Fuori da /campo
            // nessuna regola: il sito e l'app ufficio vanno sempre in rete.
            urlPattern: ({ request, url }) => request.mode === "navigate" && url.pathname.startsWith("/campo"),
            handler: "NetworkFirst",
            options: {
              cacheName: "campo-shell-v1",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 30, maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
          {
            // Chunk e CSS della build: nome con hash = immutabili, cache sicura.
            // Un chunk mai caricato non c'è: offline funziona per le pagine già viste.
            urlPattern: ({ url }) => url.origin === self.location.origin && /^\/assets-[a-z0-9]+\//.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "eic-assets-v1",
              expiration: { maxEntries: 400, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          // NESSUNA regola su /auth, /rest, /functions, /storage di Supabase: la
          // cache delle API (StaleWhileRevalidate/NetworkFirst) era la causa dei
          // dati vecchi e del login appeso su iOS. Restano sempre in rete.
        ],
      },
    })]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Forza UNA sola copia del core di React Flow. In node_modules c'erano DUE
    // versioni di @xyflow/system (0.0.76 hoisted + 0.0.77, dipendenza di
    // @xyflow/react@12) → store/misurazione divisi tra le due istanze → nel
    // flow-builder gli archi NON si renderizzavano (path SVG assenti, solo i "+"
    // dei label) e comparivano errori "no zustand provider". Il dedupe risolve
    // entrambi a un'unica istanza.
    dedupe: ["@xyflow/react", "@xyflow/system"],
  },
  // ────────────────────────────────────────────────────────────────────────
  // optimizeDeps — pre-bundle delle dipendenze TipTap in modo coerente.
  //
  // Senza include esplicito, Vite scopre TipTap "on-demand" quando incontra
  // un import dinamico (RichTextEditorSafe usa lazy()) e questo può lasciare
  // bundle cached con default-export mancante dopo un cambio di versione.
  // Forziamo Vite a includere TUTTI i sub-pacchetti TipTap nel pre-bundle
  // iniziale, così l'optimizer risolve correttamente i named export.
  //
  // exclude: i sub-pacchetti `@tiptap/extension-color` e
  // `@tiptap/extension-font-family` sono stati rimossi dal package.json
  // (in TipTap 3.x sono consolidati in `@tiptap/extension-text-style`).
  // Li listiamo qui per essere espliciti: se in futuro vengono re-installati
  // come dipendenza transitiva, Vite NON li pre-bundla con default-export.
  // ────────────────────────────────────────────────────────────────────────
  optimizeDeps: {
    include: [
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/extension-underline",
      "@tiptap/extension-text-style",
      "@tiptap/extension-text-align",
      "@tiptap/extension-link",
      "dompurify",
      // 2026-06-01 (fix crash /admin in dev): recharts (ESM) importa
      // `{ isFragment }` da react-is, il cui entry è un CJS con
      // `module.exports = require('./cjs/...')` condizionale che il
      // pre-bundler di Vite NON riesce a leggere staticamente →
      // "does not provide an export named 'isFragment'" su ogni pagina
      // con grafici (Dashboard /admin e /admin/marketing). Forzando
      // react-is (+ recharts) nel pre-bundle, esbuild espone i named
      // export via cjs-module-lexer e l'import torna a funzionare.
      // Solo dev: in produzione Rollup bundla correttamente.
      "react-is",
      "recharts",
    ],
    exclude: [
      "@tiptap/extension-color",
      "@tiptap/extension-font-family",
    ],
  },
  // 2026-05-27 (code quality audit): drop console/debugger nei build di
  // produzione. Audit ha contato 289 console.log/warn statements lasciati
  // in src/, alcuni con dati sensibili (tokens, payload edge function).
  // In dev restano per debug; in prod sparisce TUTTO via esbuild minifier.
  // logger.ts esiste già come wrapper safe per i log critici da preservare.
  //
  // 2026-05-27 (fix): preservo console.error e console.warn anche in prod —
  // servono per debug di problemi reali (es. CSP che blocca SDK, OAuth fallito,
  // edge function error). Le strip aggressive di TUTTI i console rendeva
  // impossibile diagnosticare problemi che colpiscono solo gli utenti finali.
  // Solo console.log / console.debug / console.info / console.trace vengono
  // strippate — quelle sono i candidati "rumore" dell'audit. Errori restano.
  esbuild: {
    pure: process.env.NODE_ENV === "production"
      ? ["console.log", "console.debug", "console.info", "console.trace"]
      : [],
    drop: process.env.NODE_ENV === "production" ? ["debugger"] : [],
  },
  build: {
    // Move generated bundles away from previously poisoned immutable cache
    // namespaces. Cloudflare Pages SPA fallback has served index.html for JS
    // asset URLs during deploy races; a new assets directory gives every
    // bundle a clean URL.
    assetsDir: "assets-cb3",
    chunkSizeWarningLimit: 1500,
    // ─────────────────────────────────────────────────────────────
    // modulePreload filtrato (Velocity V3, Sprint 1.A)
    // Senza questo, Rolldown mette nel <head> dell'index.html un
    // `<link rel="modulepreload">` per OGNI dipendenza transitiva
    // dei chunk lazy — incluso vendor-pdf (≈740 KB gzip!),
    // vendor-charts (≈127 KB), vendor-flow (≈65 KB), vendor-excel
    // (≈256 KB). Risultato: al primo paint il browser mobile
    // scarica ~1 MB gzip EXTRA di JS che l'utente non userà mai
    // al login. Qui escludiamo i vendor "di feature" dal preload:
    // verranno comunque caricati on-demand quando la route che
    // li importa viene montata (lazy(() => import(...))).
    // ─────────────────────────────────────────────────────────────
    modulePreload: {
      // v8.6.101 — WHITELIST strict modulePreload.
      // Solo i chunk strettamente necessari al first paint della Home.
      resolveDependencies: (_filename, deps) => {
        const KEEP_PATTERNS = [
          /\/rolldown-runtime-/,
          /\/client-/,
          /\/AuthContext-/,
          /\/vendor-shared-/,
          /\/utils-/,
          /\/createLucideIcon-/,
          /\/Home-/,
          /\/LandingNavbar-/,
          /\/HeroSection-/,
          /\/StatsSection-/,
        ];
        return deps.filter((d) => KEEP_PATTERNS.some((re) => re.test(d)));
      },
    },
    rollupOptions: {
      output: {
        // Consolidate date-fns and react-day-picker into a single named chunk.
        // Previously these were split into dozens of tiny per-function files
        // (addDays-*.js, endOfDay-*.js, en-US-*.js, dist-*.js …) whose hashes
        // got Cloudflare-CDN-cached as HTML (via _redirects SPA fallback) after
        // a bad deploy. The poisoned cache entries break the module graph for
        // any chunk that imports them. Merging into "vendor-dates" forces a new
        // URL that has never been poisoned.
        manualChunks(id) {
          // ROOT CAUSE FIX (Apple reject 2.1a, iPad): le librerie che chiamano
          // React.forwardRef/createContext AL MOMENTO DELL'EVAL del modulo NON
          // devono stare in un chunk manuale separato da react: la separazione
          // forzata crea un ciclo tra chunk e su WebKit (WKWebView) il binding
          // di React risulta non inizializzato → "undefined is not an object
          // (evaluating 's.forwardRef')" in vendor-radix → app morta al boot.
          // react-day-picker: niente regola manuale (auto-chunk coi consumer
          // lazy); @radix-ui: stesso chunk di react (serve comunque al boot).
          if (id.includes("date-fns")) {
            return "vendor-dates";
          }
          // v8.6.127 — RIMOSSO manualChunks vendor-jspdf.
          //
          // BUG IDENTIFICATO: Rolldown stava co-allocando il helper
          // `__vitePreload` (la utility globale Vite per dynamic import)
          // dentro vendor-jspdf-*.js perché era il chunk "manualChunks
          // più grande con dynamic import nel grafo". Risultato:
          //   - Home-*.js → import{i}from"./vendor-jspdf-*.js"
          //   - index-*.js → import{i as O}from"./vendor-jspdf-*.js"
          // dove `i` è il helper, NON jsPDF. Ogni chunk che usa lazy()
          // o import() tirava dietro 426KB (135 KB gzip) di blocking JS
          // anche se non usava mai jsPDF.
          //
          // Soluzione: lasciare che Rolldown chunkki jspdf nativamente
          // per dynamic import (tutti gli usi sono `await import("jspdf")`).
          // Il helper finirà in vendor-react-core o vendor-shared (già nel
          // critical path), e il chunk jspdf risultante sarà caricato SOLO
          // quando l'utente esporta un PDF.
          // (Removed: id.includes("jspdf") -> "vendor-jspdf" rule)
          // ⚠️ TUTTO @react-pdf + le sue dipendenze CIRCOLARI (fontkit/textkit/
          // pdfkit/png-js/layout/yoga/linebreak/restructure/unicode-properties/brotli)
          // DEVE stare in UN SOLO chunk. Splittarlo in vendor-react-pdf-fonts/layout/core
          // separati creava import circolari CROSS-CHUNK (core↔fonts, base↔layout, …):
          // a runtime nessun ordine di load soddisfa i cicli → un chunk accede a un binding
          // di un altro non ancora inizializzato → TDZ "Cannot access 'X' before
          // initialization" che rompeva OGNI generazione PDF e l'anteprima template.
          // Stesso pattern del chunk radix separato da React (commit 93f73e6fa). Un singolo
          // chunk lascia che Rollup hoisti e ordini le dichiarazioni internamente. È lazy:
          // caricato solo quando si genera/anteprima un PDF.
          if (
            id.includes("@react-pdf") ||
            id.includes("fontkit") ||
            id.includes("unicode-properties") ||
            id.includes("restructure") ||
            id.includes("brotli") ||
            id.includes("linebreak") ||
            id.includes("yoga-layout")
          ) {
            return "vendor-react-pdf";
          }
          if (id.includes("exceljs")) {
            return "vendor-excel";
          }
          // Vendor-flow (xyflow) and vendor-charts (recharts/d3) NO LONGER
          // get dedicated chunks. Cloudflare Pages CDN has a known upload
          // bug that randomly corrupts specific large chunks (~200-500KB),
          // resulting in 500 errors. By letting Rolldown auto-split these
          // libraries into the lazy route chunks that import them, the
          // libraries only load when the user navigates to a page that
          // actually needs them — home/marketing never trigger them.
          // (Removed: vendor-flow + vendor-charts manualChunks rules)
          if (id.includes("leaflet")) {
            return "vendor-maps";
          }
          if (id.includes("@zxing")) {
            return "vendor-qr";
          }
          if (id.includes("@radix-ui/")) {
            return "vendor-react-core";
          }
          if (id.includes("/zod/")) {
            return "vendor-zod";
          }
          if (
            id.includes("/clsx/") ||
            id.includes("/tailwind-merge/") ||
            id.includes("/class-variance-authority/")
          ) {
            return "vendor-shared";
          }
          if (id.includes("@tiptap/")) {
            return "vendor-tiptap";
          }
          // ─── React + Router + Query (critical at boot) ───
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/") ||
            id.includes("/react-router/") ||
            id.includes("/react-router-dom/") ||
            id.includes("/@tanstack/react-query/") ||
            id.includes("/history/")
          ) {
            return "vendor-react-core";
          }
          if (
            id.includes("/@supabase/") ||
            id.includes("/supabase-js/")
          ) {
            return "vendor-supabase";
          }
          if (
            id.includes("/sonner/") ||
            id.includes("/@sentry/")
          ) {
            return "vendor-ui-misc";
          }
          if (
            id.includes("/react-hook-form/") ||
            id.includes("/@hookform/")
          ) {
            return "vendor-forms";
          }
          // v8.6.128 (F2) — RIMOSSO manualChunks vendor-animation.
          //
          // Stesso bug pattern di vendor-jspdf (F1): Rolldown co-allocava
          // i helper React (react.transitional.element symbols, ~95 KB gz)
          // dentro vendor-animation-*.js perché era il manualChunk più grande
          // con dynamic import. Risultato: 733 chunks importavano
          // staticamente vendor-animation per il helper, anche se non usavano
          // mai framer-motion. Solo import per "f" + "p" = React util.
          //
          // Soluzione: lasciare framer-motion / embla-carousel / gsap
          // auto-split per dynamic import. Il helper finirà altrove (probabilmente
          // vendor-react-core). Sonner (toast) che usa framer-motion la includerà
          // automaticamente come parte del suo chunk lazy.
          //
          // Risparmio atteso: -97 KB gz da critical path (entry + Home).
          // (Removed: framer-motion + embla-carousel + gsap → "vendor-animation")

          // ============================================================
          // v8.6.125 — RIMOSSO il "area-level chunks per routes".
          //
          // Bug critico: avere `page-admin-other`, `page-azienda-marketing-*`,
          // `page-marketing-content` come catch-all faceva sì che Rolldown ci
          // mettesse dentro CODICE SHARED usato anche da Home e altri chunks
          // pubblici. Risultato (verificato da Lighthouse mobile):
          //   - Home-*.js importava STATICAMENTE da page-admin-other (2MB),
          //     page-admin-ai (190KB), page-auth (17KB), page-legal (51KB),
          //     page-marketing-content (123KB), page-admin-marketing (19KB),
          //     page-admin-settings (79KB)
          //   - LCP 14.7s su simulated throttling mobile
          //   - PSI mobile score 40
          //
          // Il fix: lasciare che Rolldown chunkki natively per dynamic import.
          // Ogni `lazy(() => import("@/pages/foo"))` diventa il suo chunk,
          // condividendo dipendenze tramite chunks "shared" automatici che
          // NON vengono importati da Home.
          //
          // Trade-off: 600-800 chunks invece di ~80. Su HTTP/2 + CDN immutable
          // questo è OK — il browser scarica solo i chunks della rotta corrente
          // (parallelizzati su multiplexed connection), e ogni chunk piccolo
          // è cached individualmente per la prossima visita.
          // ============================================================
        },
      },
    },
  },
}));
