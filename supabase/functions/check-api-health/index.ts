import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Get user's company_id
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    const companyId = profile?.company_id;

    // Read platform_settings keys
    const settingsKeys = [
      "google_maps_api_key",
      "meta_app_id",
      "meta_app_secret",
      "email_marketing_api_key",
      "email_transactional_api_key",
      "elevenlabs_api_key",
      "whatsapp_verify_token",
    ];

    const { data: settings } = await admin
      .from("platform_settings")
      .select("key, value")
      .in("key", settingsKeys);

    const settingsMap: Record<string, string> = {};
    for (const row of settings || []) {
      if (row.value) settingsMap[row.key] = row.value;
    }

    // Platform-level checks with env fallback
    const googlemaps = !!(settingsMap["google_maps_api_key"] || Deno.env.get("GOOGLE_MAPS_API_KEY"));
    const meta_platform = !!(
      (settingsMap["meta_app_id"] || Deno.env.get("META_APP_ID")) &&
      (settingsMap["meta_app_secret"] || Deno.env.get("META_APP_SECRET"))
    );
    const email_marketing = !!(settingsMap["email_marketing_api_key"] || Deno.env.get("EMAIL_MARKETING_API_KEY"));
    const email_transactional = !!(settingsMap["email_transactional_api_key"] || Deno.env.get("EMAIL_TRANSACTIONAL_API_KEY"));
    const email = email_marketing || email_transactional;
    const elevenlabs = !!(settingsMap["elevenlabs_api_key"] || Deno.env.get("ELEVENLABS_API_KEY"));
    const whatsapp_platform = !!(settingsMap["whatsapp_verify_token"] || Deno.env.get("WHATSAPP_VERIFY_TOKEN"));

    // Per-company checks
    let whatsapp = whatsapp_platform;
    let meta = meta_platform;

    if (companyId) {
      if (whatsapp_platform) {
        const { data: waConfig } = await admin
          .from("messaging_whatsapp_config")
          .select("id")
          .eq("company_id", companyId)
          .maybeSingle();
        whatsapp = !!waConfig;
      }

      if (meta_platform) {
        const { data: metaInteg } = await admin
          .from("integrations")
          .select("id")
          .eq("company_id", companyId)
          .eq("provider", "meta")
          .in("status", ["connected", "error", "token_expired"])
          .maybeSingle();
        meta = !!metaInteg;
      }
    }

    return new Response(
      JSON.stringify({ whatsapp, googlemaps, meta, email, email_marketing, email_transactional, elevenlabs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("check-api-health error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
