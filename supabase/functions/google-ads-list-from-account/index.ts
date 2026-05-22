// supabase/functions/google-ads-list-from-account/index.ts
//
// Sync read-only campagne da Google Ads API verso DB locale.
//
// STATO: SCAFFOLD v1 — l'integrazione OAuth Google Ads + chiamate API
// reali richiedono:
//   1. Google OAuth2 flow (separato da Meta, con client_id/secret distinti)
//   2. Developer Token Google Ads (richiede approval Google)
//   3. SOAP/REST Google Ads API client (più complesso di Meta Graph API)
//
// In questo scaffold:
//   • Stesso pattern di sicurezza di meta-ads-list-from-account
//   • Ritorna 501 not_implemented finché OAuth non viene configurato
//   • Quando i secrets sono configurati, sincronizza via Google Ads API v17

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

interface SyncRequest {
  company_id: string;
  google_account_id: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    // AUTH
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "unauthorized" }, 401, corsHeaders);

    let body: SyncRequest;
    try {
      body = (await req.json()) as SyncRequest;
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }

    if (!body.company_id) return json({ error: "company_id_required" }, 400, corsHeaders);

    // AUTHZ company
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isSA = (roles ?? []).some((r) => r.role === "super_admin");
    if (!isSA && profile?.company_id !== body.company_id) {
      return json({ error: "forbidden" }, 403, corsHeaders);
    }

    // Check Google Ads OAuth secrets
    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");

    if (!developerToken || !clientId || !clientSecret) {
      return json({
        error: "not_implemented",
        detail: "Google Ads integration richiede GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET nei Supabase Secrets.",
        next_steps: [
          "1. Richiedi developer token su https://ads.google.com (richiede approval Google, 1-3gg)",
          "2. Crea OAuth client su Google Cloud Console (https://console.cloud.google.com/apis/credentials)",
          "3. Configura redirect_uri verso il tuo dominio EiC",
          "4. Salva i 3 secrets in Supabase Dashboard > Settings > Secrets",
        ],
      }, 501, corsHeaders);
    }

    // TODO v2: implementare OAuth flow + Google Ads API client
    // Per ora ritorna successo vuoto se i secrets ci sono ma flow OAuth non configurato
    return json({
      success: true,
      synced: { campaigns: 0, ad_groups: 0, ads: 0 },
      note: "Google Ads sync placeholder — OAuth flow non ancora implementato",
    }, 200, corsHeaders);
  } catch (e) {
    console.error("[google-ads-list-from-account] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
