import { createRoot } from "react-dom/client";
import { installInvalidAuthSessionRecovery } from "./lib/authInvalidSessionRecovery";
import App from "./App.tsx";
import "./index.css";
// v8.6.117 — Sentry + WebVitals lazy-loaded DOPO mount per non bloccare FCP.
import { initWebVitalsReporter } from "./lib/velocity/webVitalsReporter";
// Meta Ads attribution: cattura fbclid → _fbc, bootstrap _fbp per CAPI.
import { initFacebookClickTracker } from "./lib/meta/fbcTracker";
import { isNative } from "./lib/mobile/platform";
import { bloccaZoomCampiIos } from "./lib/mobile/zoomCampiIos";
import { mettiDaParteLaPaginaPreparata } from "@/lib/paginaPreparata";

// 🚨 Service worker stale: si toglie tutto tranne il nostro /sw.js.
//
// Maggio 2026: un vecchio SW (precache di index.html) serviva contenuti
// vecchi/marketing al posto del login di `app.ediliziaincloud.com`, e qui si
// cancellavano TUTTI i SW e tutte le cache a ogni avvio.
//
// Dal 6/9/2026 /sw.js è di nuovo acceso con regole sicure (vite.config.ts:
// niente precache di index.html, niente cache delle API): serve alle Web Push e
// alla shell offline del campo. Cancellarlo a ogni avvio cancellava con lui
// l'iscrizione push del telefono (26/09/2026: 0 iscrizioni in tutta la
// piattaforma) e la cache offline. Ora:
//   - /sw.js resta, e gli si chiede di aggiornarsi (un /sw.js vecchio diventa
//     quello nuovo: stesso indirizzo, skipWaiting + clientsClaim);
//   - ogni altro SW va via, come prima;
//   - delle cache restano solo quelle del SW di oggi.
const CACHE_DEL_SW = /^(campo-shell-v1|eic-assets-v1|workbox-precache-v2-)/;
if ("serviceWorker" in navigator && !isNative) {
  void navigator.serviceWorker.getRegistrations().then(async (regs) => {
    let tolti = 0;
    for (const r of regs) {
      const script = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || "";
      let percorso = "";
      try {
        percorso = new URL(script, window.location.href).pathname;
      } catch {
        // indirizzo illeggibile: si tratta come un SW estraneo
      }
      if (percorso === "/sw.js") {
        void r.update().catch(() => {
          // Senza rete: si aggiorna al prossimo avvio.
        });
        continue;
      }
      await r.unregister();
      tolti++;
    }
    return tolti;
  })
    .then(async (tolti) => {
      // Svuota le cache che il SW di oggi non usa (quelle dei SW vecchi).
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => !CACHE_DEL_SW.test(k)).map((k) => caches.delete(k)));
      }
      return tolti;
    })
    .then((tolti) => {
      // Si ricarica solo se è stato tolto un SW estraneo e la pagina è quella
      // stale (euristica: l'app non ha mai "Richiedi una demo").
      if (!tolti) return;
      // Marca con un flag per non loopare sui reload.
      const KEY = "sw_cleanup_done_v1";
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
      const isMarketingFallback = document.body?.textContent?.includes("Richiedi una demo");
      if (isMarketingFallback) {
        window.location.reload();
      }
    })
    .catch(() => {
      // Silent: se l'unregister fallisce non c'è niente che possiamo fare
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
  const LEGACY_KEY = "vite_preload_recovered";
  const KEY = "vite_preload_recovered_v2";
  const MAX_AUTO_ATTEMPTS = 3;
  const TTL_MS = 5 * 60 * 1000;
  let attemptInfo: { count: number; firstAt: number } = { count: 0, firstAt: Date.now() };

  try {
    sessionStorage.removeItem(LEGACY_KEY);
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { count?: number; firstAt?: number };
      if (
        typeof parsed.count === "number" &&
        typeof parsed.firstAt === "number" &&
        Date.now() - parsed.firstAt < TTL_MS
      ) {
        attemptInfo = { count: parsed.count, firstAt: parsed.firstAt };
      }
    }
    if (attemptInfo.count >= MAX_AUTO_ATTEMPTS) return;
    sessionStorage.setItem(KEY, JSON.stringify({
      count: attemptInfo.count + 1,
      firstAt: attemptInfo.firstAt,
    }));
  } catch {
    // Storage non disponibile: tentiamo comunque un solo recovery best-effort.
  }

  const url = new URL(window.location.href);
  url.searchParams.set("__recovery", Date.now().toString());
  window.location.replace(url.toString());
});

// Se questa pagina E' un recovery riuscito, togli subito il parametro dalla
// barra: senza questa pulizia il ?__recovery=<timestamp> restava nell'URL,
// veniva copiato/condiviso e scansionato da Google — GSC ne contava decine
// come duplicati ("Pagina alternativa con tag canonical appropriato").
if (window.location.search.includes("__recovery=")) {
  const pulito = new URL(window.location.href);
  pulito.searchParams.delete("__recovery");
  window.history.replaceState(window.history.state, "", pulito.toString());
}

// Meta Ads attribution: idempotente, no-op se fbclid assente.
// Va PRIMA del render perché il fbclid arriva da URL al primo paint.
initFacebookClickTracker();

// iPhone e iPad: niente ingrandimento al tocco di un campo, così i campi
// possono stare a 14px (vedi zoomCampiIos.ts). Prima del render.
bloccaZoomCampiIos();

// iOS/Android (WKWebView) — rete di sicurezza contro i crash da unhandled rejection.
// Una promise non-catchata (es. fetch a una edge function fallito per CORS/cold-start,
// o un fire-and-forget DB/storage/log senza .catch) su WebKit diventa un PAGEERROR che
// fa scattare l'ErrorBoundary → schermata d'errore / crash UI. SOLO su native: logghiamo
// per diagnostica ma preventDefault per non far crashare l'app. Sul WEB lasciamo propagare
// (debug). Gli handler dedicati (auth/sessione) continuano a girare: preventDefault blocca
// solo l'azione di default del browser, non gli altri listener.
if (isNative && typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    try {
      console.warn("[native] unhandled rejection soppressa per stabilità:", event && event.reason);
    } catch { /* noop */ }
    event.preventDefault();
  });
}

const rootEl = document.getElementById("root")!;

// Le pagine del sito arrivano già prerenderizzate (scripts/prerender.mjs).
// Fino al 23/09/2026 qui c'era hydrateRoot, che però falliva SEMPRE (React
// #418 e #423): il prerender è una fotografia del browser a pagina finita,
// senza i marcatori dei Suspense e con lo stato dopo gli effetti. React
// buttava via il DOM, ridisegnava da zero e intanto mostrava il velo
// «Caricamento in corso…» sopra una pagina già letta. Ora la pagina
// preparata resta sullo schermo e React disegna la sua, nascosta, finché non
// è pronta (src/lib/paginaPreparata.ts). Il meta x-prerendered lo scrive
// solo il prerender: lo shell SPA (con lo spinner iniziale) non lo ha.
const prerenderizzata =
  rootEl.childElementCount > 0 && !!document.querySelector('meta[name="x-prerendered"]');

if (prerenderizzata) mettiDaParteLaPaginaPreparata(rootEl);
createRoot(rootEl).render(<App />);

// Velocity RUM — Web Vitals reporter (no-op in dev).
// Avviato DOPO il mount in modo da non sottrarre millisecondi al first paint.
void initWebVitalsReporter();
