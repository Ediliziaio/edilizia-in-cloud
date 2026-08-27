/**
 * Edge Function warmup — riscalda le funzioni critiche per UX dopo login.
 *
 * Problema: Supabase mette in hibernation le edge function dopo ~5 min di
 * inattività. Al primo invocation possono prendere 10-30s → spinner percepito
 * su Force2FAGuard, calendario, mappe ecc.
 *
 * Soluzione: subito dopo login completato, facciamo ping fire-and-forget
 * no-cors alle funzioni che l'utente probabilmente userà nei prossimi minuti.
 * Anche se la function risponde 401/404, il runtime viene svegliato senza
 * sporcare la console con errori attesi da endpoint non warmup-aware.
 *
 * Costo: ~9 HTTP request 1 volta per login → trascurabile vs 30s di spinner
 * salvati su Force2FAGuard, ecc.
 *
 * Idempotente: chiamato più volte non causa effetti collaterali.
 *
 * 2026-05-28 Velocity loop:
 * - Lista estesa da 5 → 9 funzioni (track-session, web-vitals, email-poll,
 *   silvio-action-runner — tutte chiamate nei primi 30s post-login).
 * - Defer 500ms → 0ms (nowait): il critical path è già parallelizzato e queste
 *   sono fire-and-forget no-cors, non rubano banda significativa.
 */
// Funzioni UX-critical: chiamate sincronamente dal flow di boot/login o
// da pagine ad alto traffico (calendario, cantieri, email).
// Ordinate per priorità: la prima è la più probabile da essere usata subito.
const WARMUP_FUNCTIONS = [
  "manage-totp",                    // Force2FAGuard al boot (PRIORITY 1)
  "track-user-session",             // session tracking immediato post-login
  "web-vitals-collect",             // Web Vitals reporter (boot)
  "maps-proxy",                     // pagine cantiere con mappa
  "google-calendar-sync",           // calendario
  "email-poll-inbox",               // /azienda/email (route hot)
  // check-api-health tolto: e' super_admin-only (legge platform_settings) →
  // per ogni utente azienda il warmup tornava 403. Lo scalda chi lo usa.
  "billing-connect",                // pagina abbonamenti
  "silvio-action-runner",           // Silvio AI panel
] as const;

let warmupAttempted = false;

function shouldRunEdgeWarmup(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") return false;
  return true;
}

function buildWarmupUrl(functionName: string): string | null {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) return null;

  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}?warmup=1`;
}

function warmupEdgeFunction(functionName: string): void {
  const url = buildWarmupUrl(functionName);
  if (!url || typeof fetch !== "function") return;

  void fetch(url, {
    method: "GET",
    mode: "no-cors",
    cache: "no-store",
    keepalive: true,
  }).catch(() => { /* silent — warmup è best-effort */ });
}

/**
 * Pings warmup-critical functions in background. Idempotente per session.
 * Da chiamare UNA volta dopo SIGNED_IN successful.
 *
 * 2026-05-28: rimosso defer 500ms. Le request sono fire-and-forget no-cors,
 * non competono con la critical-path React. Anticipare di 500ms significa
 * 500ms in meno di cold-start visibile all'utente sui primi click.
 */
export function warmupCriticalEdgeFunctions(): void {
  if (warmupAttempted) return;
  warmupAttempted = true;
  if (!shouldRunEdgeWarmup()) return;

  // No defer: queue immediato. queueMicrotask invece di setTimeout(0) per
  // partire ancora prima della prossima task macro (~0ms di delay).
  queueMicrotask(() => {
    for (const fn of WARMUP_FUNCTIONS) {
      warmupEdgeFunction(fn);
    }
  });
}

/** Per test/debug: resetta il flag così warmup può essere rieseguito. */
export function resetWarmupState(): void {
  warmupAttempted = false;
}
