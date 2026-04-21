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
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              expiration: { maxEntries: 100, maxAgeSeconds: 300 },
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
    // Move generated bundles away from /assets. Cloudflare currently has a few
    // poisoned immutable cache entries under /assets/* that return index.html
    // with a JS URL. A new assets directory gives every bundle a clean URL.
    assetsDir: "assets-v2",
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
