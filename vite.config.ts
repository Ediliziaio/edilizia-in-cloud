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
            const isEntry = /\/assets-cb1\/index-[^/]+\.css$/.test(href);
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
            reduceInlineStyles: true,
            keyframes: "critical",
            allowRules: [
              /^@font-face/,
              /^:root/,
              /^html/,
              /^body/,
            ],
            // Limita CSS inline a 8KB max per file. Sopra: defer all bundle.
            // Tradeoff: ~1 frame di FOUC su below-fold (impercepibile).
            inlineThreshold: 8192,
          });

          // Funzione ricorsiva per trovare tutti gli index.html generati
          function* findHtmlFiles(dir: string): Generator<string> {
            const entries = readdirSync(dir);
            for (const entry of entries) {
              const full = join(dir, entry);
              if (statSync(full).isDirectory()) {
                // Skip assets / icons / images dir
                if (["assets-cb1", "assets", "icons", "images", "_routes"].includes(entry)) continue;
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
      selfDestroying: true,
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
            // Critical list endpoints: stale-while-revalidate for fast mobile loads
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/(cantieri|clienti|giornale_lavori|orders|marketing_contacts|marketing_opportunities|marketing_pipelines|internal_chat_channels|appointments|profiles|staff_permissions|notifications)/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-critical",
              expiration: { maxEntries: 100, maxAgeSeconds: 120 },
            },
          },
          {
            // RPC endpoints (dashboard KPIs, etc): stale-while-revalidate
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/rpc\//i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-rpc",
              expiration: { maxEntries: 30, maxAgeSeconds: 180 },
            },
          },
          {
            // Catch-all per /rest/v1/* e /storage/v1/* (data + file API).
            // ⚠️  CRITICO: NON intercettiamo /auth/v1/* (login/signup/refresh/logout)
            // né /functions/v1/* (edge functions). Su iOS Safari un NetworkFirst
            // senza networkTimeoutSeconds applicato a /auth/v1/token POST può
            // pendere indefinitamente, lasciando l'UI bloccata su "Accesso in
            // corso..." dopo un login con credenziali valide. Lasciamo che le
            // richieste auth e functions passino direttamente alla rete del
            // browser, così il client Supabase può applicare i suoi timeouts.
            // networkTimeoutSeconds=10 forza fallback al cache se la rete pende.
            urlPattern: /^https:\/\/.*\.supabase\.co\/(rest\/v1|storage\/v1)\//i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              expiration: { maxEntries: 100, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    })]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
    ],
    exclude: [
      "@tiptap/extension-color",
      "@tiptap/extension-font-family",
    ],
  },
  build: {
    // Move generated bundles away from previously poisoned immutable cache
    // namespaces. Cloudflare Pages SPA fallback has served index.html for JS
    // asset URLs during deploy races; a new assets directory gives every
    // bundle a clean URL.
    assetsDir: "assets-cb1",
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
          if (id.includes("date-fns") || id.includes("react-day-picker")) {
            return "vendor-dates";
          }
          if (id.includes("jspdf")) {
            return "vendor-jspdf";
          }
          if (
            id.includes("@react-pdf/font") ||
            id.includes("fontkit") ||
            id.includes("unicode-properties") ||
            id.includes("restructure") ||
            id.includes("brotli")
          ) {
            return "vendor-react-pdf-fonts";
          }
          if (
            id.includes("@react-pdf/layout") ||
            id.includes("@react-pdf/textkit") ||
            id.includes("linebreak") ||
            id.includes("yoga-layout")
          ) {
            return "vendor-react-pdf-layout";
          }
          if (id.includes("@react-pdf/pdfkit") || id.includes("@react-pdf/png-js")) {
            return "vendor-react-pdf-core";
          }
          if (id.includes("@react-pdf")) {
            return "vendor-react-pdf";
          }
          if (id.includes("exceljs")) {
            return "vendor-excel";
          }
          if (id.includes("@xyflow") || id.includes("reactflow")) {
            return "vendor-flow";
          }
          if (id.includes("recharts") || id.includes("d3-")) {
            return "vendor-charts";
          }
          if (id.includes("leaflet")) {
            return "vendor-maps";
          }
          if (id.includes("@zxing")) {
            return "vendor-qr";
          }
          if (id.includes("@radix-ui/")) {
            return "vendor-radix";
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
          if (
            id.includes("embla-carousel") ||
            id.includes("framer-motion") ||
            id.includes("/gsap/")
          ) {
            return "vendor-animation";
          }

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
