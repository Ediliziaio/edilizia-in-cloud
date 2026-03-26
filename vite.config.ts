import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
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
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Required for SPA: offline navigation to any route falls back to index.html
        navigateFallback: "/index.html",
        // Exclude Supabase auth callback from service worker navigation fallback
        navigateFallbackDenylist: [/^\/auth\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("xlsx")) return "xlsx";
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor")) return "charts";
          if (id.includes("@tiptap")) return "editor";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("react-router")) return "react-router";
          if (id.includes("react-dom")) return "react-dom";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@dnd-kit")) return "dnd";
          if (id.includes("date-fns")) return "date-fns";
          if (id.includes("zod") || id.includes("react-hook-form")) return "forms";
          if (id.includes("lucide-react")) return "lucide";
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
}));
