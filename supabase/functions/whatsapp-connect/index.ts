import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";

import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify user auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  let userId: string;
  try {
    const { data: claimsData, error: claimsErr } =
      await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      const { data: userData, error: userErr } =
        await supabaseAuth.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = userData.user.id;
    } else {
      userId = claimsData.claims.sub as string;
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { code, company_id, meta_app_id } = await req.json();

    if (!code || !company_id || !meta_app_id) {
      return new Response(
        JSON.stringify({ error: "Missing code, company_id, or meta_app_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify user belongs to company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile || profile.company_id !== company_id) {
      return new Response(
        JSON.stringify({ error: "Not authorized for this company" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. Exchange code for access token
    const { metaAppSecret: APP_SECRET } = await getMetaCredentials();
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${meta_app_id}&client_secret=${APP_SECRET}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData.error);
      return new Response(
        JSON.stringify({
          error: "Token exchange failed",
          details: tokenData.error.message,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const accessToken = tokenData.access_token;

    // 2. Get shared WABA ID using debug_token
    const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}&access_token=${meta_app_id}|${APP_SECRET}`;
    const debugRes = await fetch(debugUrl);
    const debugData = await debugRes.json();

    let wabaId: string | null = null;
    const granularScopes = debugData.data?.granular_scopes || [];
    for (const scope of granularScopes) {
      if (
        scope.permission === "whatsapp_business_management" &&
        scope.target_ids?.length
      ) {
        wabaId = scope.target_ids[0];
        break;
      }
    }

    // 3. Get phone numbers from WABA
    let phoneNumber: string | null = null;
    let phoneNumberId: string | null = null;
    let businessName: string | null = null;

    if (wabaId) {
      const phonesUrl = `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${accessToken}`;
      const phonesRes = await fetch(phonesUrl);
      const phonesData = await phonesRes.json();

      if (phonesData.data?.length) {
        const phone = phonesData.data[0];
        phoneNumber = phone.display_phone_number || phone.phone_number;
        phoneNumberId = phone.id;
        businessName = phone.verified_name || null;
      }

      // 4. Subscribe app to WABA webhooks
      const subscribeUrl = `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`;
      await fetch(subscribeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      });
    }

    // 5. Save/update config
    const { data: existingConfig } = await supabase
      .from("messaging_whatsapp_config")
      .select("id")
      .eq("company_id", company_id)
      .maybeSingle();

    const configData = {
      company_id,
      phone_number: phoneNumber,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      business_name: businessName,
      access_token_encrypted: accessToken,
      is_connected: true,
      account_status: "pending",
      updated_at: new Date().toISOString(),
    };

    if (existingConfig) {
      await supabase
        .from("messaging_whatsapp_config")
        .update(configData)
        .eq("id", existingConfig.id);
    } else {
      await supabase.from("messaging_whatsapp_config").insert(configData);
    }

    return new Response(
      JSON.stringify({
        success: true,
        phone_number: phoneNumber,
        business_name: businessName,
        waba_id: wabaId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("whatsapp-connect error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
