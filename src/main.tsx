import { createRoot } from "react-dom/client";
import { installInvalidAuthSessionRecovery } from "./lib/authInvalidSessionRecovery";
import App from "./App.tsx";
import "./index.css";
// v8.6.117 — Sentry + WebVitals lazy-loaded DOPO mount per non bloccare FCP.
import { initWebVitalsReporter } from "./lib/velocity/webVitalsReporter";

// 🚨 ESPLICITO unregister di service worker stale.
//
// La config vite-plugin-pwa è `selfDestroying: true` — il nuovo SW si
// auto-distrugge — MA solo dopo aver completato il ciclo install→activate.
// Su alcuni browser (specie Brave + Chrome con shield aggressivo) il nuovo
// SW non viene mai scaricato perché viene servito un index.html stale dalla
// cache CDN, che continua a registrare il vecchio SW. Risultato:
// `app.ediliziaincloud.com` mostra contenuti vecchi/marketing al posto del
// login app.
//
// Forziamo unregister di TUTTI i SW al boot dell'app. Idempotente, safe.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length === 0) return;
    Promise.all(regs.map((r) => r.unregister()))
      .then(() => {
        // Svuota anche le caches Workbox per buona misura.
        if ("caches" in window) {
          return caches.keys().then((keys) =>
            Promise.all(keys.map((k) => caches.delete(k))),
          );
        }
        return Promise.resolve();
      })
      .then(() => {
        // Marca con un flag per non loopare sui reload.
        const KEY = "sw_cleanup_done_v1";
        if (sessionStorage.getItem(KEY)) return;
        sessionStorage.setItem(KEY, "1");
        // Reload necessario solo se l'utente sta vedendo contenuto stale:
        // verifichiamo guardando se la pagina contiene markup marketing.
        // (è un'euristica: l'app non ha mai "Richiedi una demo")
        const isMarketingFallback = document.body?.textContent?.includes("Richiedi una demo");
        if (isMarketingFallback) {
          window.location.reload();
        }
      })
      .catch(() => {
        // Silent: se l'unregister fallisce non c'è niente che possiamo fare
      });
  });
}

installInvalidAuthSessionRecovery();

// v8.6.117 — Sentry init lazy DOPO mount (era prima del mount per catturare
// errori early, ma costava 11KB JS preloadato sulla landing pubblica).
// Trade-off accettabile: errori dei primi ~200ms non catturati. La landing
// e statica, gli errori se ne occuperà ErrorBoundary client-side.
if (typeof window !== "undefined" && "requestIdleCallback" in window) {
  (window as Window & { requestIdleCallback: (cb: () => void) => void })
    .requestIdleCallback(() => {
      void import("./lib/velocity/sentry").then((m) => m.initSentry());
    });
} else {
  setTimeout(() => {
    void import("./lib/velocity/sentry").then((m) => m.initSentry());
  }, 1000);
}

// When a lazy-loaded chunk fails (e.g. after a new deploy the old hash no
// longer exists on the server), Vite fires this event. Force a hard reload so
// the browser picks up the fresh index.html + new chunk hashes.
window.addEventListener("vite:preloadError", () => {
  const KEY = "vite_preload_recovered";
  if (sessionStorage.getItem(KEY)) return;
  sessionStorage.setItem(KEY, "1");
  const url = new URL(window.location.href);
  url.searchParams.set("__recovery", Date.now().toString());
  window.location.replace(url.toString());
});

createRoot(document.getElementById("root")!).render(<App />);

// Velocity RUM — Web Vitals reporter (no-op in dev).
// Avviato DOPO il mount in modo da non sottrarre millisecondi al first paint.
void initWebVitalsReporter();
