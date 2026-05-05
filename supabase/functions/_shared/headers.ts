/**
 * Shared CORS + security headers for all edge functions.
 * Import this instead of defining corsHeaders locally.
 *
 * SECURITY: CORS è ristretto a una whitelist statica + subdomain matching
 * + validazione dinamica per custom domain white-label (cache in-memory).
 * - getCorsHeaders(req) è SINCRONA — sicura da usare ovunque senza await.
 * - I custom domain vengono validati via DB e cachati per 5 min.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Whitelist statica — domini piattaforma + dev ──────────────────────────────
const STATIC_ORIGINS = [
  "https://app.ediliziaincloud.com",
  "https://clienti.ediliziaincloud.com",
  "https://admin.ediliziaincloud.com",
  "https://lavori.ediliziaincloud.com",
  "https://www.ediliziaincloud.com",
  "https://app.ediliziaincloud.it",
  "https://clienti.ediliziaincloud.it",
  "https://admin.ediliziaincloud.it",
  "https://lavori.ediliziaincloud.it",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
];

// Pattern matching per subdomain *.ediliziaincloud.*
const PLATFORM_SUFFIXES = [".ediliziaincloud.it", ".ediliziaincloud.com"];

// In dev qualsiasi porta di localhost / 127.0.0.1 è accettata (Vite/Claude Preview/etc.)
const DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

// ── Cache in-memory per custom domains verificati (TTL 5 min) ────────────────
const verifiedDomainCache = new Set<string>();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Carica i custom domain verificati dal DB in background (fire-and-forget). */
function refreshDomainCacheInBackground(): void {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return;

  const sb = createClient(supabaseUrl, serviceKey);
  void (async () => {
    const { data } = await sb.from("company_branding")
      .select("custom_domain")
      .eq("custom_domain_verified", true)
      .eq("is_active", true)
      .not("custom_domain", "is", null);

    verifiedDomainCache.clear();
    if (data) {
      for (const row of data) {
        if (row.custom_domain) verifiedDomainCache.add(row.custom_domain);
      }
    }
    cacheLoadedAt = Date.now();
  })()
    .catch(() => {
      /* silently fail — cache remains stale */
    });
}

/** Verifica sincrona se un Origin è ammesso. */
function isAllowedOriginSync(origin: string): boolean {
  // 1. Whitelist statica
  if (STATIC_ORIGINS.includes(origin)) return true;

  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  // 2. Dev: qualunque porta su localhost / 127.0.0.1
  if (DEV_HOSTS.has(hostname)) return true;

  // 3. Subdomain matching *.ediliziaincloud.it / *.ediliziaincloud.com
  for (const suffix of PLATFORM_SUFFIXES) {
    if (hostname.endsWith(suffix)) return true;
  }

  // 4. Custom domain — check in-memory cache
  if (verifiedDomainCache.has(hostname)) return true;

  // 5. Trigger background refresh se cache è scaduta
  if (Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    refreshDomainCacheInBackground();
  }

  return false;
}

/**
 * Restituisce gli header CORS con l'Origin specifico del chiamante se è ammesso,
 * altrimenti usa il dominio di produzione principale.
 * SINCRONA — sicura da usare senza await.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = isAllowedOriginSync(origin);
  const allowedOrigin = allowed ? origin : STATIC_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

/** Alias per chiarezza — identica a getCorsHeaders. */
export const getCorsHeadersSync = getCorsHeaders;

/**
 * @deprecated Usa getCorsHeaders(req) per rispondere con l'Origin corretto.
 * Mantenuto per retrocompatibilità con webhook inbound (Stripe, Meta, SDI)
 * che sono chiamate server-to-server e non necessitano di CORS dinamico.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": STATIC_ORIGINS[0],
  "Access-Control-Allow-Headers": ALLOW_HEADERS,
  "Vary": "Origin",
};

/** CORS + security headers combinati. Usa per tutte le risposte non-OPTIONS. */
export const secureHeaders: Record<string, string> = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/**
 * Helper: restituisce una risposta JSON di errore con header di sicurezza.
 *
 * corsOverride (tipicamente `getCorsHeaders(req)`) se passato sovrascrive le
 * chiavi CORS di `secureHeaders` senza perdere gli header di sicurezza (CSP,
 * X-Frame-Options, ecc.). Se non passato usa le CORS statiche come fallback.
 */
export function errorResponse(message: string, status = 400, corsOverride?: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...secureHeaders, ...(corsOverride ?? {}), "Content-Type": "application/json" } }
  );
}

/**
 * Helper: restituisce una risposta JSON di successo con header di sicurezza.
 *
 * Vedi errorResponse per semantica di corsOverride.
 */
export function jsonResponse(data: unknown, status = 200, corsOverride?: Record<string, string>): Response {
  return new Response(
    JSON.stringify(data),
    { status, headers: { ...secureHeaders, ...(corsOverride ?? {}), "Content-Type": "application/json" } }
  );
}
