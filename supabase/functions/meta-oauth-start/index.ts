import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { chiediPermessiMessaggi, modalitaMessaggiSocial, PERMESSI_MESSAGGI } from "../_shared/socialMessaggiMeta.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { company_id } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const [profileRes, rolesRes] = await Promise.all([
      adminClient
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle(),
      adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId),
    ]);
    const userCompanyId = profileRes.data?.company_id ?? null;
    const isSuperAdmin = (rolesRes.data ?? []).some((r) => r.role === "super_admin");
    if (!isSuperAdmin && userCompanyId !== company_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { metaAppId, metaAppSecret } = await getMetaCredentials();
    if (!metaAppId || !metaAppSecret) {
      return new Response(JSON.stringify({ error: "META_APP_ID or META_APP_SECRET not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Build callback URL
    const callbackUrl = `${supabaseUrl}/functions/v1/meta-oauth-callback`;

    // Build HMAC-signed state (stateless, no DB needed)
    const timestamp = Date.now();
    const statePayload = JSON.stringify({ company_id, user_id: userId, ts: timestamp });
    const stateB64 = btoa(statePayload);

    // Sign state with HMAC-SHA256 using META_APP_SECRET
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(metaAppSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(stateB64));
    const hmac = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");

    // State = base64payload.hmac
    const signedState = `${stateB64}.${hmac}`;

    const scopes = [
      "pages_show_list",
      "pages_read_engagement",
      // Senza pages_manage_metadata l'iscrizione della pagina al webhook
      // leadgen (POST /{page}/subscribed_apps) NON è effettiva: Meta risponde
      // success ma non consegna gli eventi → lead solo via backfill manuale.
      "pages_manage_metadata",
      "leads_retrieval",
      "pages_manage_ads",
      "ads_read",
      "business_management",
      // Messaggi di Instagram e Messenger (platform_settings.meta_messaggi_attivi):
      // per tutti solo dopo l'approvazione di Meta; in "revisione" solo il super
      // admin, che ha il ruolo sull'app e può concederli per le prove.
      ...(chiediPermessiMessaggi(await modalitaMessaggiSocial(adminClient), isSuperAdmin) ? PERMESSI_MESSAGGI : []),
    ].join(",");

    const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(signedState)}&scope=${encodeURIComponent(scopes)}&response_type=code`;

    return new Response(JSON.stringify({ oauth_url: oauthUrl }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("meta-oauth-start error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
