/**
 * Velocity Protocol — Sprint 1.C — Sentry setup
 *
 * Error + performance monitoring opt-in via env var VITE_SENTRY_DSN.
 * Se la DSN non è impostata, Sentry NON viene inizializzato (no-op):
 * così in dev / self-hosted / in assenza di chiave non abbiamo sorprese.
 *
 * Il modulo è volutamente stringato: `initSentry()` è l'unico export e
 * viene chiamato prima del mount React da src/main.tsx.
 *
 * Strategy:
 *   • tracesSampleRate 0.1 in prod (10% delle transazioni tracciate)
 *   • replaysSessionSampleRate 0 (no replay di default — privacy/peso)
 *   • replaysOnErrorSampleRate 1.0 (replay completo quando c'è un errore)
 *   • beforeSend: filtriamo ResizeObserver noise e altri known-no-ops
 */

// @sentry/react è caricato DINAMICAMENTE dentro initSentry(): questo modulo
// è importato staticamente da App/AuthContext/ProtectedRoute (helper capture*),
// quindi un import statico della libreria trascinerebbe ~40KB gzip nel chunk
// d'ingresso, vanificando il lazy-load post-mount di main.tsx. Gli helper
// degradano a console finché la libreria non è pronta (sentryMod null).
type SentryModule = typeof import("@sentry/react");

let sentryMod: SentryModule | null = null;
let initStarted = false;

const KNOWN_NOISE = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "Non-Error promise rejection captured",
  // La lazy chunk load error è già gestita dal reload in main.tsx: niente rumore.
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
];

export async function initSentry(): Promise<void> {
  if (initStarted) return;
  initStarted = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // No-op senza DSN — comportamento safe per chi non usa Sentry.
    return;
  }

  const env = (import.meta.env.MODE as string) || "production";
  const release =
    (import.meta.env.VITE_APP_VERSION as string | undefined) ??
    (import.meta.env.VITE_COMMIT_SHA as string | undefined);

  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      environment: env,
      release,
      // Perf monitoring: 10% in prod, 100% in dev
      tracesSampleRate: env === "production" ? 0.1 : 1.0,
      // Replay: off by default, full replay sugli errori
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      // Filtri noise
      ignoreErrors: KNOWN_NOISE,
      beforeSend(event) {
        const msg = event.message ?? event.exception?.values?.[0]?.value ?? "";
        if (KNOWN_NOISE.some((n) => msg.includes(n))) return null;
        return event;
      },
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
    });
    sentryMod = Sentry;
  } catch (e) {
    // Sentry init fallito: non blocchiamo l'app.
    if (import.meta.env.DEV) {
       
      console.warn("[velocity] Sentry init skipped:", e);
    }
  }
}

/**
 * Helper opzionale per loggare eccezioni con tag velocity senza dover
 * importare @sentry/react ovunque. Se Sentry non è attivo, fallback a
 * console.warn con contesto ben formattato (utile in dev).
 */
export function captureVelocityError(
  where: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  if (!sentryMod) {
    if (import.meta.env.DEV) {

      console.warn(`[velocity:${where}]`, error, extra ?? {});
    }
    return;
  }
  try {
    sentryMod.captureException(error, {
      tags: { velocity_area: where },
      extra,
    });
  } catch {
    /* noop — non si propaga un errore sul reporter di errori */
  }
}

/**
 * Traccia un evento di prodotto non-error (es. "wizard.generate.start",
 * "wizard.generate.success", "quote.saved"). Implementato come Sentry
 * breadcrumb: zero costo di rete finché non avviene un errore nella
 * sessione — allora il breadcrumb trail arriva insieme all'exception,
 * fornendo contesto puntuale su cosa stava facendo l'utente.
 *
 * In dev senza DSN: fa console.info, così lo sviluppatore vede gli
 * eventi nel devtools senza dover configurare Sentry locale.
 *
 * Per metriche aggregate (% abbandoni per step, latenza media AI, etc.)
 * l'ideale sarebbe integrare PostHog/Mixpanel — ma per avere *qualcosa*
 * adesso, i breadcrumb Sentry visibili sulle exception sono il 80/20.
 */
export function captureVelocityEvent(
  name: string,
  data?: Record<string, unknown>,
): void {
  if (!sentryMod) {
    if (import.meta.env.DEV) {

      console.info(`[velocity:event:${name}]`, data ?? {});
    }
    return;
  }
  try {
    sentryMod.addBreadcrumb({
      category: "velocity",
      message: name,
      level: "info",
      data,
    });
  } catch {
    /* noop */
  }
}

/**
 * Imposta user context + tag per tutti gli eventi Sentry successivi.
 *
 * Chiamato da AuthContext quando l'utente è autenticato:
 *   setSentryUserContext({ id, role, tenantId, email })
 *
 * Quando l'utente si sloga passa `null` per pulire.
 *
 * In compliance GDPR: non passiamo l'email se non già normalizzata a livello
 * di consent. Qui accettiamo email solo se esplicitamente fornita dal caller.
 */
export function setSentryUserContext(
  ctx: { id: string; role?: string | null; tenantId?: string | null; email?: string } | null,
): void {
  if (!sentryMod) return;
  try {
    if (ctx === null) {
      sentryMod.setUser(null);
      sentryMod.setTag("role", undefined);
      sentryMod.setTag("tenant_id", undefined);
      return;
    }
    sentryMod.setUser({
      id: ctx.id,
      ...(ctx.email ? { email: ctx.email } : {}),
    });
    if (ctx.role) sentryMod.setTag("role", ctx.role);
    if (ctx.tenantId) sentryMod.setTag("tenant_id", ctx.tenantId);
  } catch {
    /* noop */
  }
}
