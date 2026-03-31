/**
 * Shared CORS + security headers for all edge functions.
 * Import this instead of defining corsHeaders locally.
 *
 * SECURITY: CORS è ora ristretto a una whitelist di domini specifici.
 * - Usa getCorsHeaders(req) per rispondere con l'Origin corretto del chiamante.
 * - corsHeaders è mantenuto per retrocompatibilità (webhook server-to-server,
 *   funzioni pubbliche). Non usarlo per endpoint che gestiscono dati aziendali.
 */

const ALLOWED_ORIGINS = [
  "https://app.ediliziaincloud.it",
  "https://clienti.ediliziaincloud.it",
  "https://admin.ediliziaincloud.it",
  "http://localhost:5173",
  "http://localhost:3000",
];

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

/**
 * Restituisce gli header CORS con l'Origin specifico del chiamante se è in whitelist,
 * altrimenti usa il dominio di produzione principale.
 * Da usare su tutti gli endpoint chiamati dal browser con dati aziendali.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
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
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
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
