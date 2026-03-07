import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Send email via the configured provider */
async function sendViaProvider(
  provider: string,
  apiKey: string,
  from: string,
  to: string[],
  subject: string,
  html: string
): Promise<{ ok: boolean; status: number; body: unknown }> {
  let url: string;
  let headers: Record<string, string>;
  let body: string;

  switch (provider) {
    case "sendgrid": {
      url = "https://api.sendgrid.com/v3/mail/send";
      headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      body = JSON.stringify({
        personalizations: [{ to: to.map((e) => ({ email: e })) }],
        from: { email: from.includes("<") ? from.match(/<(.+)>/)?.[1] || from : from },
        subject,
        content: [{ type: "text/html", value: html }],
      });
      break;
    }
    case "sendinblue":
    case "brevo": {
      url = "https://api.brevo.com/v3/smtp/email";
      headers = {
        "api-key": apiKey,
        "Content-Type": "application/json",
      };
      body = JSON.stringify({
        sender: { email: from.includes("<") ? from.match(/<(.+)>/)?.[1] || from : from },
        to: to.map((e) => ({ email: e })),
        subject,
        htmlContent: html,
      });
      break;
    }
    case "resend":
    default: {
      url = "https://api.resend.com/emails";
      headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      body = JSON.stringify({ from, to, subject, html });
      break;
    }
  }

  const res = await fetch(url, { method: "POST", headers, body });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, campaignId, companyId } = await req.json();
    if (!to || !campaignId) {
      return new Response(
        JSON.stringify({ error: "Parametri mancanti: to, campaignId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch campaign
    const { data: campaign, error: campError } = await adminClient
      .from("email_campaigns")
      .select("subject, html_content, sender_email, sender_name")
      .eq("id", campaignId)
      .single();

    if (campError || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campagna non trovata" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read provider config from platform_settings
    const provider = (await getPlatformSetting("email_provider")) || "sendgrid";
    const apiKey = await getPlatformSetting("email_provider_api_key");

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "API Key del provider email non configurata. Vai in Impostazioni Piattaforma → Email Provider.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fromAddress = campaign.sender_email
      ? campaign.sender_name
        ? `${campaign.sender_name} <${campaign.sender_email}>`
        : campaign.sender_email
      : "noreply@ediliziacloud.it";

    const htmlBody =
      campaign.html_content ||
      `<html><body><p>Nessun contenuto HTML disponibile per questa campagna.</p></body></html>`;

    const result = await sendViaProvider(
      provider,
      apiKey,
      fromAddress,
      [to],
      `[TEST] ${campaign.subject || "Senza oggetto"}`,
      htmlBody
    );

    // Deduct email credits if companyId provided
    if (companyId) {
      // Get active pricing
      const { data: pricing } = await adminClient
        .from("email_pricing")
        .select("cost_billed_per_email")
        .eq("provider", provider)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (pricing) {
        await adminClient.rpc("deduct_email_credits", {
          p_company_id: companyId,
          p_cost: pricing.cost_billed_per_email,
        });
      }
    }

    return new Response(JSON.stringify(result.body), {
      status: result.ok ? 200 : result.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
