import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

interface IntegrationResult {
  name: string;
  status: "healthy" | "degraded" | "down" | "unconfigured";
  last_seen: string | null;
  response_ms: number | null;
  error: string | null;
}

async function pingWithLatency(url: string, options?: RequestInit): Promise<{ ok: boolean; status: number; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), ...options });
    return { ok: res.ok, status: res.status, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, status: 0, latency_ms: Date.now() - start, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth check — allow both super_admin (full check) and company users (basic)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Check if super_admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    const isSuperAdmin = !!roleRow;

    // Read platform_settings keys
    const settingsKeys = [
      "stripe_secret_key",
      "meta_app_id",
      "meta_app_secret",
      "email_marketing_api_key",
      "email_transactional_api_key",
      "elevenlabs_api_key",
      "whatsapp_verify_token",
      "telnyx_api_key",
      "gocardless_access_token",
      "google_maps_api_key",
    ];

    const { data: settings } = await admin
      .from("platform_settings")
      .select("key, value")
      .in("key", settingsKeys);

    const settingsMap: Record<string, string> = {};
    for (const row of settings || []) {
      if (row.value) settingsMap[row.key] = row.value;
    }

    const results: IntegrationResult[] = [];
    const now = new Date().toISOString();

    // ── Stripe ────────────────────────────────────────────────────────────
    const stripeKey = settingsMap["stripe_secret_key"] || Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      const ping = await pingWithLatency("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      results.push({
        name: "stripe",
        status: ping.ok ? "healthy" : ping.status === 401 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "stripe", status: "unconfigured", last_seen: null, response_ms: null, error: "API key not configured" });
    }

    // ── SendGrid / Elastic Email ───────────────────────────────────────────
    const emailTransKey = settingsMap["email_transactional_api_key"] || Deno.env.get("EMAIL_TRANSACTIONAL_API_KEY");
    if (emailTransKey) {
      const ping = await pingWithLatency("https://api.sendgrid.com/v3/user/profile", {
        headers: { Authorization: `Bearer ${emailTransKey}` },
      });
      const isElasticEmail = emailTransKey.length < 40; // rough heuristic
      results.push({
        name: isElasticEmail ? "elastic_email" : "sendgrid",
        status: ping.ok ? "healthy" : ping.status === 401 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "sendgrid", status: "unconfigured", last_seen: null, response_ms: null, error: "API key not configured" });
    }

    // ── ElevenLabs ────────────────────────────────────────────────────────
    const elevenKey = settingsMap["elevenlabs_api_key"] || Deno.env.get("ELEVENLABS_API_KEY");
    if (elevenKey) {
      const ping = await pingWithLatency("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": elevenKey },
      });
      results.push({
        name: "elevenlabs",
        status: ping.ok ? "healthy" : ping.status === 401 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "elevenlabs", status: "unconfigured", last_seen: null, response_ms: null, error: "API key not configured" });
    }

    // ── Telnyx ────────────────────────────────────────────────────────────
    const telnyxKey = settingsMap["telnyx_api_key"] || Deno.env.get("TELNYX_API_KEY");
    if (telnyxKey) {
      const ping = await pingWithLatency("https://api.telnyx.com/v2/balance", {
        headers: { Authorization: `Bearer ${telnyxKey}` },
      });
      results.push({
        name: "telnyx",
        status: ping.ok ? "healthy" : ping.status === 401 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "telnyx", status: "unconfigured", last_seen: null, response_ms: null, error: "API key not configured" });
    }

    // ── GoCardless ────────────────────────────────────────────────────────
    const gcToken = settingsMap["gocardless_access_token"] || Deno.env.get("GOCARDLESS_ACCESS_TOKEN");
    if (gcToken) {
      const ping = await pingWithLatency("https://api.gocardless.com/creditors", {
        headers: {
          Authorization: `Bearer ${gcToken}`,
          "GoCardless-Version": "2015-07-06",
        },
      });
      results.push({
        name: "gocardless",
        status: ping.ok ? "healthy" : ping.status === 401 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "gocardless", status: "unconfigured", last_seen: null, response_ms: null, error: "Token not configured" });
    }

    // ── WhatsApp (Meta) ───────────────────────────────────────────────────
    const metaAppId = settingsMap["meta_app_id"] || Deno.env.get("META_APP_ID");
    const metaAppSecret = settingsMap["meta_app_secret"] || Deno.env.get("META_APP_SECRET");
    if (metaAppId && metaAppSecret) {
      const ping = await pingWithLatency(
        `https://graph.facebook.com/v18.0/${metaAppId}?fields=id,name&access_token=${metaAppId}|${metaAppSecret}`
      );
      results.push({
        name: "meta_whatsapp",
        status: ping.ok ? "healthy" : ping.status === 401 ? "degraded" : "down",
        last_seen: now,
        response_ms: ping.latency_ms,
        error: ping.ok ? null : (ping.error || `HTTP ${ping.status}`),
      });
    } else {
      results.push({ name: "meta_whatsapp", status: "unconfigured", last_seen: null, response_ms: null, error: "Meta credentials not configured" });
    }

    // ── Google Maps ───────────────────────────────────────────────────────
    const mapsKey = settingsMap["google_maps_api_key"] || Deno.env.get("GOOGLE_MAPS_API_KEY");
    results.push({
      name: "google_maps",
      status: mapsKey ? "healthy" : "unconfigured",
      last_seen: mapsKey ? now : null,
      response_ms: null,
      error: mapsKey ? null : "API key not configured",
    });

    // ── Persist results to integration_health_log (super_admin only) ──────
    if (isSuperAdmin) {
      const rows = results
        .filter((r) => r.status !== "unconfigured")
        .map((r) => ({
          integration_name: r.name,
          company_id: null,
          status: r.status,
          response_ms: r.response_ms,
          error_message: r.error,
          checked_at: now,
        }));

      if (rows.length > 0) {
        await admin.from("integration_health_log" as never).insert(rows as never);
      }
    }

    // ── Legacy compatibility: also return flat boolean map ─────────────────
    const legacy = {
      whatsapp: results.find((r) => r.name === "meta_whatsapp")?.status === "healthy",
      googlemaps: results.find((r) => r.name === "google_maps")?.status === "healthy",
      meta: results.find((r) => r.name === "meta_whatsapp")?.status === "healthy",
      email: results.find((r) => r.name === "sendgrid" || r.name === "elastic_email")?.status === "healthy",
      email_marketing: !!(settingsMap["email_marketing_api_key"] || Deno.env.get("EMAIL_MARKETING_API_KEY")),
      email_transactional: !!(emailTransKey),
      elevenlabs: results.find((r) => r.name === "elevenlabs")?.status === "healthy",
    };

    return new Response(
      JSON.stringify({ integrations: results, ...legacy }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("check-api-health error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
