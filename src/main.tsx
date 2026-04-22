import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/velocity/sentry";
import { initWebVitalsReporter } from "./lib/velocity/webVitalsReporter";

// Velocity — Sentry init PRIMA del mount per catturare errori early.
// No-op se VITE_SENTRY_DSN non è definita.
initSentry();

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
