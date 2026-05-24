/**
 * Edge Function warmup — riscalda le funzioni critiche per UX dopo login.
 *
 * Problema: Supabase free-tier mette in hibernation le edge function dopo
 * ~5 min di inattività. Al primo invocation possono prendere 10-30s →
 * spinner percepito su Force2FAGuard, calendario, mappe ecc.
 *
 * Soluzione: subito dopo login completato, facciamo ping fire-and-forget
 * no-cors alle funzioni che l'utente probabilmente userà nei prossimi minuti.
 * Anche se la function risponde 401/404, il runtime viene svegliato senza
 * sporcare la console con errori attesi da endpoint non warmup-aware.
 *
 * Costo: ~5 HTTP request 1 volta per login → trascurabile vs 30s di spinner
 * salvati su Force2FAGuard, ecc.
 *
 * Idempotente: chiamato più volte non causa effetti collaterali.
 */
// Funzioni UX-critical: chiamate sincronamente dal flow di boot/login o
// da pagine ad alto traffico (calendario, cantieri).
// Ordinate per priorità: la prima è la più probabile da essere usata subito.
const WARMUP_FUNCTIONS = [
  "manage-totp",          // Force2FAGuard al boot
  "maps-proxy",           // pagine cantiere con mappa
  "google-calendar-sync", // calendario
  "check-api-health",     // diagnostica health bar
  "billing-connect",      // pagina abbonamenti
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
 */
export function warmupCriticalEdgeFunctions(): void {
  if (warmupAttempted) return;
  warmupAttempted = true;
  if (!shouldRunEdgeWarmup()) return;

  // Defer di 500ms dopo login per non competere con la critical-path
  // (fetch profile, role, company). Le funzioni iniziano a riscaldarsi
  // mentre l'utente vede la dashboard.
  setTimeout(() => {
    for (const fn of WARMUP_FUNCTIONS) {
      warmupEdgeFunction(fn);
    }
  }, 500);
}

/** Per test/debug: resetta il flag così warmup può essere rieseguito. */
export function resetWarmupState(): void {
  warmupAttempted = false;
}
