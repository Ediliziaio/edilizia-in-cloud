import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { encrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { assertMetaCompanyAdminAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const { code, company_id } = await req.json();

    if (!code || !company_id) {
      return new Response(
        JSON.stringify({ error: "Missing code or company_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await assertMetaCompanyAdminAccess(supabase, userId, company_id);

    // 1. Exchange code for access token
    const { metaAppId, metaAppSecret } = await getMetaCredentials();
    if (!metaAppId || !metaAppSecret) {
      return new Response(
        JSON.stringify({ error: "Meta App ID o App Secret non configurati" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const tokenParams = new URLSearchParams({
      client_id: metaAppId,
      client_secret: metaAppSecret,
      code,
    });
    const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${tokenParams}`);
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      console.error("Token exchange error:", tokenData.error);
      return new Response(
        JSON.stringify({
          error: "Token exchange failed",
          details: tokenData.error?.message || "Access token non ricevuto da Meta",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const accessToken = tokenData.access_token;

    // 2. Get shared WABA ID using debug_token
    const debugParams = new URLSearchParams({
      input_token: accessToken,
      access_token: `${metaAppId}|${metaAppSecret}`,
    });
    const debugRes = await fetch(`https://graph.facebook.com/v21.0/debug_token?${debugParams}`);
    const debugData = await debugRes.json();
    if (!debugRes.ok || debugData.error) {
      return new Response(
        JSON.stringify({
          error: "Impossibile verificare il token WhatsApp",
          details: debugData.error?.message || "Risposta non valida da Meta",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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

    if (!wabaId) {
      return new Response(
        JSON.stringify({ error: "Nessun WhatsApp Business Account condiviso da Meta" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Get phone numbers from WABA
    let phoneNumber: string | null = null;
    let phoneNumberId: string | null = null;
    let businessName: string | null = null;

    const phonesParams = new URLSearchParams({ access_token: accessToken });
    const phonesRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?${phonesParams}`);
    const phonesData = await phonesRes.json();

    if (!phonesRes.ok || phonesData.error) {
      return new Response(
        JSON.stringify({
          error: "Impossibile leggere i numeri WhatsApp Business",
          details: phonesData.error?.message || "Risposta non valida da Meta",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (phonesData.data?.length) {
      const phone = phonesData.data[0];
      phoneNumber = phone.display_phone_number || phone.phone_number;
      phoneNumberId = phone.id;
      businessName = phone.verified_name || null;
    }

    if (!phoneNumberId) {
      return new Response(
        JSON.stringify({ error: "Nessun numero WhatsApp disponibile per il WABA selezionato" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Subscribe app to WABA webhooks
    const subscribeParams = new URLSearchParams({ access_token: accessToken });
    const subscribeUrl = `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps?${subscribeParams}`;
    const subscribeRes = await fetch(subscribeUrl, {
      method: "POST",
    });
    const subscribeData = await subscribeRes.json().catch(() => ({}));
    if (!subscribeRes.ok || subscribeData.error) {
      return new Response(
        JSON.stringify({
          error: "Collegamento webhook WhatsApp non riuscito",
          details: subscribeData.error?.message || "Meta non ha confermato la subscription",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Save/update config
    const encKey = getEncryptionKey();
    const encryptedAccessToken = await encrypt(accessToken, encKey);
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
      access_token_encrypted: encryptedAccessToken,
      is_connected: true,
      account_status: "pending",
      updated_at: new Date().toISOString(),
    };

    if (existingConfig) {
      const { error: updateError } = await supabase
        .from("messaging_whatsapp_config")
        .update(configData)
        .eq("id", existingConfig.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from("messaging_whatsapp_config").insert(configData);
      if (insertError) throw insertError;
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
      JSON.stringify({ error: getErrorMessage(err) }),
      {
        status: getErrorStatus(err),
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
