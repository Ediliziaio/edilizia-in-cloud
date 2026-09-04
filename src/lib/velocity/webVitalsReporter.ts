/**
 * Velocity Protocol — Sprint 1.B — Web Vitals reporter (client-side)
 *
 * Inizializza i listener di `web-vitals` e spedisce le metriche a
 * /functions/v1/web-vitals-collect in batch, usando navigator.sendBeacon
 * quando disponibile (non blocca la navigazione / pagehide).
 *
 * Design:
 *   • Una sola init per pagina — guard interno.
 *   • Batch buffer: accumulo fino a MAX_BUFFER metriche, flush on:
 *       - visibilitychange=hidden
 *       - pagehide
 *       - soglia buffer raggiunta
 *   • Campione 100% per now (basso volume). In futuro: sampling rate via env.
 *   • Totale best-effort: se l'endpoint è down, NON ritentiamo né solleviamo
 *     errori visibili all'utente. La telemetria non deve mai degradare l'UX.
 */

import type { MetricType } from "web-vitals";

interface QueuedMetric {
  name: string;
  value: number;
  rating?: string;
  delta?: number;
  id?: string;
  navigationType?: string;
  path?: string;
}

const MAX_BUFFER = 10;
let initialized = false;
const buffer: QueuedMetric[] = [];

function getEndpoint(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;
  return `${url.replace(/\/$/, "")}/functions/v1/web-vitals-collect`;
}

function getAnonKey(): string | null {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? null;
}

function getContext() {
  // navigator.connection è non-standard, disponibile su Chrome/Edge/Android
  // deno-lint-ignore no-explicit-any
  const conn = (navigator as any).connection;
  return {
    userAgent: navigator.userAgent,
    effectiveType: conn?.effectiveType as string | undefined,
    // deno-lint-ignore no-explicit-any
    deviceMemory: (navigator as any).deviceMemory as number | undefined,
    hardwareConcurrency: navigator.hardwareConcurrency,
  };
}

function getSessionId(): string {
  const KEY = "velocity_session_id";
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id =
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)) + Date.now().toString(36);
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function flush() {
  if (buffer.length === 0) return;
  const endpoint = getEndpoint();
  if (!endpoint) {
    buffer.length = 0;
    return;
  }
  const anonKey = getAnonKey();
  const payload = JSON.stringify({
    session_id: getSessionId(),
    metrics: buffer.splice(0, buffer.length),
    context: getContext(),
  });

  // Niente sendBeacon: la funzione richiede la chiave (risponde 401 senza) e il
  // beacon non puo' aggiungere header. In piu' parte sempre in modalita'
  // credentials "include", che con la nostra CORS (senza Allow-Credentials)
  // faceva fallire il preflight. Il beacon rispondeva comunque "accodato", il
  // codice usciva soddisfatto e le metriche non arrivavano MAI. Resta la fetch
  // con keepalive, che sopravvive alla chiusura della pagina come il beacon.
  // 2) fetch keepalive (best-effort)
  try {
    void fetch(endpoint, {
      method: "POST",
      body: payload,
      headers: {
        "Content-Type": "application/json",
        ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
      },
      keepalive: true,
      // Timeout via AbortSignal: se non parte in 5s, lascia perdere.
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      /* silent — la telemetria non deve disturbare l'UX */
    });
  } catch {
    /* noop */
  }
}

function handleMetric(metric: MetricType) {
  buffer.push({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    path: typeof location !== "undefined" ? location.pathname : undefined,
  });

  if (buffer.length >= MAX_BUFFER) {
    flush();
  }
}

export async function initWebVitalsReporter(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // In dev non inviamo: troppa rumore e non c'è utente reale
  if (import.meta.env.DEV) return;

  try {
    // Lazy-load della lib così il peso non entra nell'entry bundle
    const { onLCP, onINP, onCLS, onTTFB, onFCP } = await import("web-vitals");

    onLCP(handleMetric);
    onINP(handleMetric);
    onCLS(handleMetric);
    onTTFB(handleMetric);
    onFCP(handleMetric);

    // Flush quando l'utente lascia la pagina / cambia tab
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush, { once: false });
    // Safety: flush 2 minuti dopo init anche se non hidden (SPA longeva)
    setTimeout(flush, 2 * 60 * 1000);
  } catch (e) {
    // import fallito (offline, bundle mancante): silenzioso
    if (import.meta.env.DEV) {

      console.warn("[velocity] web-vitals init skipped:", e);
    }
  }
}
