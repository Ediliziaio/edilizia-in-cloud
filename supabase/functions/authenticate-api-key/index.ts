import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse, secureHeaders } from "../_shared/headers.ts";

/**
 * Edge Function: authenticate-api-key
 *
 * Autentica chiamate API esterne tramite API Key (header x-api-key).
 * - Verifica hash SHA-256
 * - Controlla scadenza
 * - Verifica scope richiesto (query param ?scope=contacts:read)
 * - Applica rate limiting (per minuto e per giorno)
 * - Logga l'utilizzo in api_usage_log e aggiorna api_usage_daily
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const startTime = Date.now();

  // 1. Estrai API key dall'header
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return errorResponse("Header x-api-key mancante", 401);
  }

  // 2. Hash SHA-256 della chiave
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(apiKey));
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // 3. Cerca la chiave nel DB
  const { data: keyData, error: keyError } = await admin
    .from("api_keys")
    .select("id, company_id, name, scopes, is_active, expires_at, rate_limit_per_minute, rate_limit_per_day")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (keyError || !keyData) {
    return errorResponse("API key non valida", 401);
  }

  // 4. Controlla se attiva
  if (!keyData.is_active) {
    return errorResponse("API key revocata", 403);
  }

  // 5. Controlla scadenza
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return errorResponse("API key scaduta", 403);
  }

  // 6. Controlla scope richiesto
  const url = new URL(req.url);
  const requiredScope = url.searchParams.get("scope");
  if (requiredScope) {
    const scopes: string[] = keyData.scopes || [];
    if (!scopes.includes(requiredScope)) {
      await logUsage(admin, keyData, req, 403, startTime);
      return errorResponse(`Scope '${requiredScope}' non autorizzato per questa API key`, 403);
    }
  }

  // 7. Rate limiting — per minuto
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: minuteCount } = await admin
    .from("api_usage_log")
    .select("*", { count: "exact", head: true })
    .eq("api_key_id", keyData.id)
    .gte("created_at", oneMinuteAgo);

  if ((minuteCount || 0) >= keyData.rate_limit_per_minute) {
    await logUsage(admin, keyData, req, 429, startTime);
    return new Response(
      JSON.stringify({ error: "Rate limit superato (per minuto). Riprova tra poco." }),
      {
        status: 429,
        headers: {
          ...secureHeaders,
          "Retry-After": "60",
          "X-RateLimit-Limit": String(keyData.rate_limit_per_minute),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  // 8. Rate limiting — per giorno
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: dayCount } = await admin
    .from("api_usage_log")
    .select("*", { count: "exact", head: true })
    .eq("api_key_id", keyData.id)
    .gte("created_at", todayStart.toISOString());

  if ((dayCount || 0) >= keyData.rate_limit_per_day) {
    await logUsage(admin, keyData, req, 429, startTime);
    return new Response(
      JSON.stringify({ error: "Rate limit giornaliero superato." }),
      {
        status: 429,
        headers: {
          ...secureHeaders,
          "Retry-After": "3600",
          "X-RateLimit-Limit": String(keyData.rate_limit_per_day),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  // 9. Aggiorna last_used_at
  await admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyData.id);

  // 10. Logga utilizzo (successo)
  await logUsage(admin, keyData, req, 200, startTime);

  // 11. Aggiorna api_usage_daily (upsert)
  await updateDailyStats(admin, keyData, true, Date.now() - startTime);

  // 12. Ritorna contesto autenticato
  return jsonResponse({
    authenticated: true,
    company_id: keyData.company_id,
    api_key_id: keyData.id,
    api_key_name: keyData.name,
    scopes: keyData.scopes,
    rate_limit: {
      per_minute: { limit: keyData.rate_limit_per_minute, used: (minuteCount || 0) + 1 },
      per_day: { limit: keyData.rate_limit_per_day, used: (dayCount || 0) + 1 },
    },
  });
});

// --- Helper functions ---

async function logUsage(
  admin: ReturnType<typeof createClient>,
  keyData: { id: string; company_id: string },
  req: Request,
  statusCode: number,
  startTime: number
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") || null;
  const url = new URL(req.url);

  await admin.from("api_usage_log").insert({
    api_key_id: keyData.id,
    company_id: keyData.company_id,
    endpoint: url.pathname + url.search,
    method: req.method,
    status_code: statusCode,
    ip_address: ip,
    response_time_ms: Date.now() - startTime,
  });
}

async function updateDailyStats(
  admin: ReturnType<typeof createClient>,
  keyData: { id: string; company_id: string },
  success: boolean,
  responseTimeMs: number
) {
  const today = new Date().toISOString().split("T")[0];

  // Cerca record esistente
  const { data: existing } = await admin
    .from("api_usage_daily")
    .select("id, total_requests, successful_requests, failed_requests, avg_response_time_ms")
    .eq("api_key_id", keyData.id)
    .eq("date", today)
    .maybeSingle();

  if (existing) {
    const total = (existing.total_requests || 0) + 1;
    const avgMs = existing.avg_response_time_ms || 0;
    const newAvg = Math.round((avgMs * (total - 1) + responseTimeMs) / total);

    await admin
      .from("api_usage_daily")
      .update({
        total_requests: total,
        successful_requests: (existing.successful_requests || 0) + (success ? 1 : 0),
        failed_requests: (existing.failed_requests || 0) + (success ? 0 : 1),
        avg_response_time_ms: newAvg,
      })
      .eq("id", existing.id);
  } else {
    await admin.from("api_usage_daily").insert({
      api_key_id: keyData.id,
      company_id: keyData.company_id,
      date: today,
      total_requests: 1,
      successful_requests: success ? 1 : 0,
      failed_requests: success ? 0 : 1,
      avg_response_time_ms: Math.round(responseTimeMs),
    });
  }
}
