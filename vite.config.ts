import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
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
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.ico", "robots.txt", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Edilizia in Cloud",
        short_name: "EdiliziaIC",
        description: "Gestionale completo per imprese edili italiane",
        theme_color: "#0a0a0f",
        background_color: "#0a0a0f",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/azienda",
        lang: "it",
        categories: ["business", "productivity"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          {
            name: "Cantieri",
            short_name: "Cantieri",
            url: "/azienda/cantieri",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Giornale Lavori",
            short_name: "Giornale",
            url: "/azienda/giornale-lavori",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Clienti",
            short_name: "Clienti",
            url: "/azienda/clienti",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        // Only precache icons, images and fonts — NOT JS/CSS bundles.
        // JS/CSS chunks already have content-hash filenames and are cached
        // by Cloudflare edge (immutable, 1 year). Precaching them in the SW
        // causes stale-cache blank-page crashes whenever a new deploy ships.
        globPatterns: ["**/*.{ico,png,svg,woff2}"],
        // SPA fallback: offline navigation returns index.html
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/auth\//, /^\/assets\//],
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
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/(cantieri|clienti|giornale_lavori)/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-critical",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 },
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
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
}));
