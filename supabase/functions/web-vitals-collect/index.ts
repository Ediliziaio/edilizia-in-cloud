/**
 * Velocity Protocol — Sprint 1.B — Web Vitals RUM collector
 *
 * Riceve batch di metriche Web Vitals dal client (sendBeacon/fetch)
 * e le inserisce in public.web_vitals_events via service role
 * (bypassa RLS — la tabella è in sola lettura per super_admin).
 *
 * Payload atteso:
 *   {
 *     session_id?: string,
 *     company_id?: string | null,
 *     metrics: Array<{
 *       name: 'LCP'|'INP'|'CLS'|'TTFB'|'FCP'|'FID',
 *       value: number,
 *       rating?: 'good'|'needs-improvement'|'poor',
 *       delta?: number,
 *       id?: string,            // web-vitals Metric.id per dedup
 *       navigationType?: string,
 *       path?: string,
 *     }>,
 *     context?: {
 *       userAgent?: string,
 *       effectiveType?: string,
 *       deviceMemory?: number,
 *       hardwareConcurrency?: number,
 *     }
 *   }
 *
 * Best-effort: errori non devono bloccare il client. Se l'INSERT
 * fallisce loggiamo e restituiamo 202 (accepted) lo stesso.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const MAX_METRICS_PER_BATCH = 20;
const VALID_METRIC_NAMES = new Set(["LCP", "INP", "CLS", "TTFB", "FCP", "FID"]);
const VALID_RATINGS = new Set(["good", "needs-improvement", "poor"]);

interface MetricPayload {
  name: string;
  value: number;
  rating?: string;
  delta?: number;
  id?: string;
  navigationType?: string;
  path?: string;
}

interface RequestBody {
  session_id?: string;
  company_id?: string | null;
  metrics: MetricPayload[];
  context?: {
    userAgent?: string;
    effectiveType?: string;
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
}

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsH });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsH });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      // Missing env: accept silently so il client non ritenta a oltranza
      return new Response(JSON.stringify({ ok: false, reason: "env_missing" }), {
        status: 202,
        headers: { ...corsH, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // User id (best-effort): lo estraiamo dal JWT se presente, altrimenti null
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data } = await admin.auth.getUser(token);
      userId = data.user?.id ?? null;
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return new Response("Bad JSON", { status: 400, headers: corsH });
    }

    if (!body || !Array.isArray(body.metrics) || body.metrics.length === 0) {
      return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
        status: 202,
        headers: { ...corsH, "Content-Type": "application/json" },
      });
    }

    // Cap e sanificazione batch
    const metrics = body.metrics.slice(0, MAX_METRICS_PER_BATCH);
    const userAgent =
      typeof body.context?.userAgent === "string"
        ? body.context.userAgent.slice(0, 400)
        : req.headers.get("user-agent")?.slice(0, 400) ?? null;

    const now = new Date().toISOString();
    const rows = metrics
      .filter((m) => m && VALID_METRIC_NAMES.has(m.name) && Number.isFinite(m.value))
      .map((m) => ({
        created_at: now,
        user_id: userId,
        company_id: body.company_id ?? null,
        session_id: body.session_id ? String(body.session_id).slice(0, 64) : null,
        name: m.name,
        value: Number(m.value),
        rating: m.rating && VALID_RATINGS.has(m.rating) ? m.rating : null,
        delta: Number.isFinite(m.delta) ? Number(m.delta) : null,
        metric_id: m.id ? String(m.id).slice(0, 128) : null,
        navigation_type: m.navigationType ? String(m.navigationType).slice(0, 32) : null,
        path: m.path ? String(m.path).slice(0, 256) : null,
        user_agent: userAgent,
        effective_type: body.context?.effectiveType
          ? String(body.context.effectiveType).slice(0, 16)
          : null,
        device_memory: Number.isFinite(body.context?.deviceMemory)
          ? Number(body.context!.deviceMemory)
          : null,
        hardware_concurrency: Number.isFinite(body.context?.hardwareConcurrency)
          ? Math.min(256, Math.max(0, Math.floor(Number(body.context!.hardwareConcurrency))))
          : null,
      }));

    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
        status: 202,
        headers: { ...corsH, "Content-Type": "application/json" },
      });
    }

    const { error } = await admin.from("web_vitals_events").insert(rows);

    if (error) {
      // Log server-side, rispondiamo comunque 202 per non far ritentare il client
      console.error("[web-vitals-collect] insert error:", error.message);
      return new Response(JSON.stringify({ ok: false, reason: "db_error" }), {
        status: 202,
        headers: { ...corsH, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
      status: 202,
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[web-vitals-collect] unhandled:", (e as Error).message);
    return new Response(JSON.stringify({ ok: false }), {
      status: 202,
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  }
});
