import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

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
        globPatterns: ["**/*.{ico,png,svg,woff2}"],
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
  build: {
    // Move generated bundles away from previously poisoned immutable cache
    // namespaces. Cloudflare Pages SPA fallback has served index.html for JS
    // asset URLs during deploy races; a new assets directory gives every
    // bundle a clean URL.
    assetsDir: "assets-v3",
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
      resolveDependencies: (_filename, deps) => {
        const HEAVY_OPTIONAL = /vendor-(pdf|charts|flow|maps|qr|excel)/;
        return deps.filter((d) => !HEAVY_OPTIONAL.test(d));
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
          if (id.includes("@react-pdf") || id.includes("jspdf")) {
            return "vendor-pdf";
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
        },
      },
    },
  },
}));
