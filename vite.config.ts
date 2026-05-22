import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import Beasties from "beasties";
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
          // Converte ogni <link rel="stylesheet"> in preload non-blocking.
          // Manteniamo l'attributo crossorigin se presente.
          return html.replace(
            /<link\s+rel="stylesheet"\s+crossorigin\s+href="([^"]+)"\s*\/?>/g,
            (_match, href) => `<link rel="preload" as="style" crossorigin href="${href}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" crossorigin href="${href}"></noscript>`,
          );
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
          const beasties = new Beasties({
            path: path.resolve(__dirname, "dist"),
            publicPath: "/",
            preload: "swap",
            inlineFonts: false,
            pruneSource: false, // mantieni CSS originali (servono per below-fold)
            mergeStylesheets: false,
            additionalStylesheets: [],
            compress: true,
            logLevel: "info",
            // Heuristics: include regole base anche se non matchano l'HTML
            // (utility Tailwind più comuni nel hero)
            keyframes: "critical",
            allowRules: [
              /^@font-face/,
              /^:root/,
              /^html/,
              /^body/,
            ],
          });

          // Funzione ricorsiva per trovare tutti gli index.html generati
          function* findHtmlFiles(dir: string): Generator<string> {
            const entries = readdirSync(dir);
            for (const entry of entries) {
              const full = join(dir, entry);
              if (statSync(full).isDirectory()) {
                // Skip assets / icons / images dir
                if (["assets-v4", "assets", "icons", "images", "_routes"].includes(entry)) continue;
                yield* findHtmlFiles(full);
              } else if (entry.endsWith(".html")) {
                yield full;
              }
            }
          }

          const distDir = path.resolve(__dirname, "dist");
          let processed = 0;
          for (const htmlFile of findHtmlFiles(distDir)) {
            try {
              const html = readFileSync(htmlFile, "utf-8");
              const processedHtml = await beasties.process(html);
              writeFileSync(htmlFile, processedHtml);
              processed += 1;
            } catch (e) {
              console.warn(`[beasties] skip ${htmlFile}: ${(e as Error).message}`);
            }
          }
          console.log(`[beasties] processed ${processed} HTML file(s)`);
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
    assetsDir: "assets-v4",
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
      // Prima il pattern era blacklist (escludere chunk heavy): risultato
      // 207 modulepreload nel <head> di index.html — la quasi totalita
      // erano icone Lucide (un chunk per icona ESM tree-shaken), dialoghi
      // Radix interattivi, e route secondarie. Il browser scaricava ~1MB
      // gzip al boot, parser bloccato 800ms+ (PSI mobile score 40, LCP 11.8s).
      //
      // Ora teniamo SOLO i chunk strettamente necessari al first paint
      // della Home (root /). Tutto il resto verra fetchato on-demand quando
      // il modulo che li importa entra nel grafo (es. click su un dialog ->
      // dynamic import del chunk del dialog).
      //
      // Pattern KEEP: framework + provider sempre montati + utility shared
      // + chunk del routing entry. Niente icone, niente route lazy, niente
      // componenti UI interattivi pesanti.
      resolveDependencies: (_filename, deps) => {
        const KEEP_PATTERNS = [
          // Runtime & React core
          /\/rolldown-runtime-/,
          /\/client-/,  // react-dom client
          // Error tracking ora lazy (vedi src/main.tsx v8.6.117) — escluso dal preload
          // /\/sentry-/,
          // Provider sempre montati (App.tsx li wrappa)
          /\/QueryClientProvider-/,
          /\/AuthContext-/,
          /\/ErrorBoundary-/,
          // Shared utility usate ovunque (clsx, tailwind-merge, zod base)
          /\/vendor-shared-/,
          /\/utils-/,
          // Lucide icon factory base (le singole icone NO -> lazy on first use)
          /\/createLucideIcon-/,
          // ─── Above-the-fold della Home (lazy ma critical per LCP) ───
          // Senza questi, waterfall: index.js -> scopre Home -> scopre HeroSection
          // -> scopre LandingNavbar = 4 round trip prima del first paint.
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
          // Consolidamento Radix UI (18 sub-pacchetti, prima frantumati in
          // chunk piccoli ~10-20KB cad). Un unico vendor-radix riduce HTTP
          // overhead e migliora cache hit-rate.
          if (id.includes("@radix-ui/")) {
            return "vendor-radix";
          }
          // v8.6.116 — zod estratto in chunk separato 'vendor-zod' (lazy):
          // zod ~50KB compressed e' usato SOLO in 13 dialog/form components,
          // tutti dietro lazy(). Prima viaggiava in vendor-shared (preload
          // critical) -> wasted 50KB al boot per chi resta sulla landing.
          // Ora chunk on-demand, escluso dai modulePreload KEEP_PATTERNS.
          if (id.includes("/zod/")) {
            return "vendor-zod";
          }
          // Shared utility (clsx + tailwind-merge): usate ovunque → meritano
          // un loro chunk dedicato per dedup e cache.
          if (
            id.includes("/clsx/") ||
            id.includes("/tailwind-merge/") ||
            id.includes("/class-variance-authority/")
          ) {
            return "vendor-shared";
          }
          // TipTap consolidato: 6 sub-pacchetti, sempre caricati insieme
          // (RichTextEditor è lazy ma dentro carica tutta la suite).
          if (id.includes("@tiptap/")) {
            return "vendor-tiptap";
          }

          // ============================================================
          // VENDOR REACT CORE — base critica per ogni route
          // Tutti questi sono bundle critico al boot.
          // ============================================================
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
          // Supabase SDK + auth
          if (
            id.includes("/@supabase/") ||
            id.includes("/supabase-js/")
          ) {
            return "vendor-supabase";
          }
          // ⚠️ Lucide icons NON raggruppati: 344KB tutto in un chunk
          // bloccava TBT 9.9s su desktop. Lasciamo che Rollup li distribuisca
          // naturalmente nei chunks che li importano (tree-shaking nativo).
          // if (id.includes("lucide-react")) return "vendor-icons";
          // Sonner / toast / sentry
          if (
            id.includes("/sonner/") ||
            id.includes("/@sentry/")
          ) {
            return "vendor-ui-misc";
          }
          // React Hook Form
          if (
            id.includes("/react-hook-form/") ||
            id.includes("/@hookform/")
          ) {
            return "vendor-forms";
          }
          // Embla carousel / framer-motion / animation
          if (
            id.includes("embla-carousel") ||
            id.includes("framer-motion") ||
            id.includes("/gsap/")
          ) {
            return "vendor-animation";
          }

          // ============================================================
          // AREA-LEVEL CHUNKS per routes
          // Prima erano ogni Page.tsx un chunk → 1232 chunks totali!
          // Raggruppando per area: ~80 chunks totali, drastic riduzione
          // round-trips HTTP/2 e CDN cache hit-rate migliore.
          // ============================================================

          // Marketing pages — landing pubbliche (Home eager, altre lazy individuali)
          // NB: NON raggruppare tutte in un chunk unico (era 705KB) → ogni page
          // resta lazy individuale, Rollup le splitta in chunks 50-150KB.
          // Blog/Glossario raggruppati per condividere markdown renderer.
          if (
            id.includes("/src/pages/Blog.") ||
            id.includes("/src/pages/BlogPost.") ||
            id.includes("/src/pages/BlogCategory.") ||
            id.includes("/src/pages/Glossario.") ||
            id.includes("/src/pages/CasiStudio.")
          ) {
            return "page-marketing-content";
          }
          // Marketing landings dinamiche città/per (alta cardinalità ma stesso bundle)
          if (
            id.includes("/src/pages/marketing/") ||
            id.includes("/src/pages/landing/")
          ) {
            return "page-marketing-dyn";
          }
          // Legal / static pages
          if (
            id.includes("/src/pages/PrivacyPolicy") ||
            id.includes("/src/pages/CookiePolicy") ||
            id.includes("/src/pages/TerminiServizio") ||
            id.includes("/src/pages/CondizioniUtilizzoSito") ||
            id.includes("/src/pages/AvvisoLegale") ||
            id.includes("/src/pages/DPA")
          ) {
            return "page-legal";
          }
          // Auth pages
          if (
            id.includes("/src/pages/Login") ||
            id.includes("/src/pages/AdminLogin") ||
            id.includes("/src/pages/ClientiLogin") ||
            id.includes("/src/pages/LavoriLogin") ||
            id.includes("/src/pages/auth/")
          ) {
            return "page-auth";
          }
          // Admin area — splittato per sub-area (prima era unico 2.9MB)
          if (id.includes("/src/pages/admin/ai/")) {
            return "page-admin-ai";
          }
          if (id.includes("/src/pages/admin/billing/")) {
            return "page-admin-billing";
          }
          if (
            id.includes("/src/pages/admin/marketing/") ||
            id.includes("/src/pages/admin/seo/")
          ) {
            return "page-admin-marketing";
          }
          if (
            id.includes("/src/pages/admin/users/") ||
            id.includes("/src/pages/admin/companies/")
          ) {
            return "page-admin-users";
          }
          if (
            id.includes("/src/pages/admin/settings/") ||
            id.includes("/src/pages/admin/integrations/")
          ) {
            return "page-admin-settings";
          }
          // Admin other splittato ulteriormente per ridurre 2MB chunk
          if (id.includes("/src/pages/admin/dashboard")) return "page-admin-dashboard";
          if (id.includes("/src/pages/admin/cantieri")) return "page-admin-cantieri";
          if (id.includes("/src/pages/admin/finanza") || id.includes("/src/pages/admin/banking")) {
            return "page-admin-finanza";
          }
          if (id.includes("/src/pages/admin/notifications") || id.includes("/src/pages/admin/email")) {
            return "page-admin-notifications";
          }
          if (
            id.includes("/src/pages/admin/") ||
            id.includes("/src/routes/adminRoutes")
          ) {
            return "page-admin-other";
          }

          // Azienda area — splittato per sub-area
          // NB: marketing è troppo grosso (2.1MB) — splittato ulteriormente.
          if (id.includes("/src/pages/azienda/marketing/AdsManagerBeta")) {
            return "page-azienda-marketing-ads";
          }
          if (
            id.includes("/src/pages/azienda/marketing/email") ||
            id.includes("/src/pages/azienda/sms-marketing/") ||
            id.includes("/src/pages/azienda/marketing/Campaign") ||
            id.includes("/src/pages/azienda/marketing/DragDropEmail")
          ) {
            return "page-azienda-marketing-campaigns";
          }
          if (
            id.includes("/src/pages/azienda/marketing/Quote") ||
            id.includes("/src/pages/azienda/marketing/Preventivi") ||
            id.includes("/src/pages/azienda/marketing/UnifiedPreventivi")
          ) {
            return "page-azienda-marketing-quotes";
          }
          if (
            id.includes("/src/pages/azienda/marketing/") ||
            id.includes("/src/pages/azienda/sms-marketing/")
          ) {
            return "page-azienda-marketing-other";
          }
          if (id.includes("/src/pages/azienda/fatturazione/")) {
            return "page-azienda-fatturazione";
          }
          if (id.includes("/src/pages/azienda/billing/")) {
            return "page-azienda-billing";
          }
          if (id.includes("/src/pages/azienda/ordini/")) {
            return "page-azienda-ordini";
          }
          if (id.includes("/src/pages/azienda/magazzino/")) {
            return "page-azienda-magazzino";
          }
          if (id.includes("/src/pages/azienda/impostazioni/")) {
            return "page-azienda-impostazioni";
          }
          if (id.includes("/src/pages/azienda/cantiere/")) {
            return "page-azienda-cantiere";
          }

          // NB: NON raggruppare /src/components/landing/ — vanificherebbe
          // il lazy() delle sezioni below-the-fold (PainPoints, Modules,
          // FAQ, etc.). Solo Hero/Stats/Navbar sono eager su Home.tsx.
        },
      },
    },
  },
}));
