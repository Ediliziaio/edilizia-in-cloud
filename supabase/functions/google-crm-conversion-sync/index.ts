// Sync CRM milestones to Google Ads offline conversions.
//
// Scaffold v1: reads the same Google Ads prerequisites as the account sync.
// Real upload requires Google Ads Developer Token, OAuth refresh token/customer
// selection, and conversion action IDs configured per company.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ error: "server_not_configured" }, 500, corsHeaders);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "unauthorized" }, 401, corsHeaders);

    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");

    const body = await safeJson(req);
    const companyId = typeof body.company_id === "string" ? body.company_id : null;
    if (!companyId) return json({ error: "company_id_required" }, 400, corsHeaders);

    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isSuperAdmin = (roles ?? []).some((row: { role: string }) => row.role === "super_admin");
    if (!isSuperAdmin && profile?.company_id !== companyId) {
      return json({ error: "forbidden" }, 403, corsHeaders);
    }

    const { count } = await admin
      .from("google_ads_offline_conversion_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["pending", "failed"]);

    if (!developerToken || !clientId || !clientSecret) {
      return json({
        error: "not_configured",
        pending: count ?? 0,
        detail: "Google Ads offline conversions richiede Developer Token, OAuth client e conversion action configurate.",
      }, 501, corsHeaders);
    }

    return json({
      success: true,
      pending: count ?? 0,
      uploaded: 0,
      note: "Google Ads offline conversion upload placeholder: configurare conversion actions e refresh token per l'invio reale.",
    }, 200, corsHeaders);
  } catch (e) {
    console.error("[google-crm-conversion-sync] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

async function safeJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
