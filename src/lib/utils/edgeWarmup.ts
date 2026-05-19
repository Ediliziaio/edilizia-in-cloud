/**
 * Edge Function warmup — riscalda le funzioni critiche per UX dopo login.
 *
 * Problema: Supabase free-tier mette in hibernation le edge function dopo
 * ~5 min di inattività. Al primo invocation possono prendere 10-30s →
 * spinner percepito su Force2FAGuard, calendario, mappe ecc.
 *
 * Soluzione: subito dopo login completato, facciamo fire-and-forget invocation
 * delle funzioni che l'utente probabilmente userà nei prossimi minuti.
 * Le funzioni che non riconoscono `action: "_warmup"` ritornano 400 ma
 * importantissimo è che siano state "swapped in" dal runtime.
 *
 * Costo: ~5 HTTP request 1 volta per login → trascurabile vs 30s di spinner
 * salvati su Force2FAGuard, ecc.
 *
 * Idempotente: chiamato più volte non causa effetti collaterali (gli errori
 * 400 da action sconosciuta vengono silenziati).
 */
import { supabase } from "@/integrations/supabase/client";

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

/**
 * Pings warmup-critical functions in background. Idempotente per session.
 * Da chiamare UNA volta dopo SIGNED_IN successful.
 */
export function warmupCriticalEdgeFunctions(): void {
  if (warmupAttempted) return;
  warmupAttempted = true;

  // Defer di 500ms dopo login per non competere con la critical-path
  // (fetch profile, role, company). Le funzioni iniziano a riscaldarsi
  // mentre l'utente vede la dashboard.
  setTimeout(() => {
    for (const fn of WARMUP_FUNCTIONS) {
      // fire-and-forget: ignora completamente la risposta.
      // Gli errori 4xx/5xx sono silenziati intenzionalmente — l'obiettivo
      // è solo "swap in" la function nel runtime.
      void supabase.functions
        .invoke(fn, { body: { action: "_warmup" } })
        .catch(() => { /* silent — warmup è best-effort */ });
    }
  }, 500);
}

/** Per test/debug: resetta il flag così warmup può essere rieseguito. */
export function resetWarmupState(): void {
  warmupAttempted = false;
}
