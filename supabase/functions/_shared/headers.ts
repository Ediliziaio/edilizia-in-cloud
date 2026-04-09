/**
 * Shared CORS + security headers for all edge functions.
 * Import this instead of defining corsHeaders locally.
 *
 * SECURITY: CORS è ora ristretto a una whitelist statica + validazione
 * dinamica per custom domain white-label (query company_branding).
 * - Usa getCorsHeaders(req) per rispondere con l'Origin corretto del chiamante.
 * - corsHeaders è mantenuto per retrocompatibilità (webhook server-to-server).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Whitelist statica — domini piattaforma + dev ──────────────────────────────
const STATIC_ORIGINS = [
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

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

// ── Cache in-memory per custom domains (TTL 5 min) ────────────────────────────
const domainCache = new Map<string, { allowed: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Verifica se un Origin è ammesso (whitelist statica + subdomain + custom domain). */
async function isAllowedOrigin(origin: string): Promise<boolean> {
  // 1. Whitelist statica
  if (STATIC_ORIGINS.includes(origin)) return true;

  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  // 2. Subdomain matching *.ediliziaincloud.it / *.ediliziaincloud.com
  for (const suffix of PLATFORM_SUFFIXES) {
    if (hostname.endsWith(suffix)) return true;
  }

  // 3. Custom domain — check cache first
  const cached = domainCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.allowed;

  // 4. Custom domain — query DB
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      // Senza credenziali, rifiutiamo i custom domain
      domainCache.set(hostname, { allowed: false, expiresAt: Date.now() + CACHE_TTL_MS });
      return false;
    }
    const sb = createClient(supabaseUrl, serviceKey);
    const { data } = await sb
      .from("company_branding")
      .select("id")
      .eq("custom_domain", hostname)
      .eq("custom_domain_verified", true)
      .eq("is_active", true)
      .maybeSingle();

    const allowed = !!data;
    domainCache.set(hostname, { allowed, expiresAt: Date.now() + CACHE_TTL_MS });
    return allowed;
  } catch {
    // In caso di errore DB, rifiuta ma con TTL breve (30s)
    domainCache.set(hostname, { allowed: false, expiresAt: Date.now() + 30_000 });
    return false;
  }
}

/**
 * Restituisce gli header CORS con l'Origin specifico del chiamante se è ammesso,
 * altrimenti usa il dominio di produzione principale.
 */
export async function getCorsHeaders(req: Request): Promise<Record<string, string>> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = await isAllowedOrigin(origin);
  const allowedOrigin = allowed ? origin : STATIC_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Vary": "Origin",
  };
}

/**
 * Versione sincrona per retrocompatibilità — valida solo per whitelist statica.
 * Per supporto custom domain, usa getCorsHeaders(req) (async).
 */
export function getCorsHeadersSync(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  let allowed = STATIC_ORIGINS.includes(origin);
  if (!allowed) {
    try {
      const hostname = new URL(origin).hostname;
      for (const suffix of PLATFORM_SUFFIXES) {
        if (hostname.endsWith(suffix)) { allowed = true; break; }
      }
    } catch { /* ignore */ }
  }
  const allowedOrigin = allowed ? origin : STATIC_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Vary": "Origin",
  };
}

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

/** Helper: restituisce una risposta JSON di errore con header di sicurezza. */
export function errorResponse(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: secureHeaders }
  );
}

/** Helper: restituisce una risposta JSON di successo con header di sicurezza. */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    { status, headers: secureHeaders }
  );
}
