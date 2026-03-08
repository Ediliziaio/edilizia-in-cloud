import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Send email via the configured provider */
async function sendEmail(
  apiKey: string,
  provider: string,
  from: string,
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean; status: number; body: unknown }> {
  let url: string;
  let headers: Record<string, string>;
  let body: string;

  switch (provider) {
    case "sendgrid": {
      url = "https://api.sendgrid.com/v3/mail/send";
      headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      body = JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from.includes("<") ? from.match(/<(.+)>/)?.[1] || from : from },
        subject,
        content: [{ type: "text/html", value: html }],
      });
      break;
    }
    case "sendinblue":
    case "brevo": {
      url = "https://api.brevo.com/v3/smtp/email";
      headers = { "api-key": apiKey, "Content-Type": "application/json" };
      body = JSON.stringify({
        sender: { email: from.includes("<") ? from.match(/<(.+)>/)?.[1] || from : from },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      });
      break;
    }
    case "resend":
    default: {
      url = "https://api.resend.com/emails";
      headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      body = JSON.stringify({ from, to: [to], subject, html });
      break;
    }
  }

  const res = await fetch(url, { method: "POST", headers, body });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

/** Send WhatsApp message via Cloud API */
async function sendWhatsApp(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  text: string,
  contentType: string = "text",
  mediaUrl: string | null = null
): Promise<{ ok: boolean; status: number; body: unknown }> {
  // Normalize phone number
  const cleanPhone = toPhone.replace(/[^0-9]/g, "");
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  let bodyPayload: Record<string, unknown>;

  switch (contentType) {
    case "image":
      bodyPayload = {
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "image",
        image: mediaUrl
          ? { link: mediaUrl, caption: text || undefined }
          : { id: text },
      };
      break;
    case "document":
      bodyPayload = {
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "document",
        document: mediaUrl
          ? { link: mediaUrl, caption: text || undefined, filename: "documento.pdf" }
          : { id: text },
      };
      break;
    case "audio":
      bodyPayload = {
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "audio",
        audio: mediaUrl ? { link: mediaUrl } : { id: text },
      };
      break;
    default:
      bodyPayload = {
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "text",
        text: { body: text },
      };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyPayload),
  });
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
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { contact_id, channel, content, subject } = await req.json();

    if (!contact_id || !channel || !content) {
      return new Response(
        JSON.stringify({ error: "Parametri mancanti: contact_id, channel, content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["whatsapp", "email", "sms"].includes(channel)) {
      return new Response(
        JSON.stringify({ error: "Canale non valido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (content.length > 5000) {
      return new Response(
        JSON.stringify({ error: "Messaggio troppo lungo (max 5000 caratteri)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch contact + verify company ownership
    const { data: contact, error: contactError } = await adminClient
      .from("marketing_contacts")
      .select("id, company_id, email, phone, first_name, last_name")
      .eq("id", contact_id)
      .single();

    if (contactError || !contact) {
      return new Response(
        JSON.stringify({ error: "Contatto non trovato" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user belongs to same company
    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    const isSuperAdmin = claimsData.claims.user_role === "super_admin";
    if (!isSuperAdmin && profile?.company_id !== contact.company_id) {
      return new Response(
        JSON.stringify({ error: "Non autorizzato per questo contatto" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let status = "sent";
    let errorDetail: string | null = null;

    // ── SEND by channel ──
    if (channel === "email") {
      if (!contact.email) {
        return new Response(
          JSON.stringify({ error: "Il contatto non ha un indirizzo email" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const provider = (await getPlatformSetting("email_transactional_provider")) || (await getPlatformSetting("email_marketing_provider")) || "sendgrid";
      const apiKey = (await getPlatformSetting("email_transactional_api_key")) || (await getPlatformSetting("email_marketing_api_key"));

      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "API Key del provider email non configurata" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fromAddress = "noreply@ediliziacloud.it";
      const emailSubject = subject || "Messaggio";
      const html = `<html><body><p>${content.replace(/\n/g, "<br>")}</p></body></html>`;

      const result = await sendEmail(apiKey, provider, fromAddress, contact.email, emailSubject, html);
      if (!result.ok) {
        status = "failed";
        errorDetail = JSON.stringify(result.body);
      }
    } else if (channel === "whatsapp") {
      if (!contact.phone) {
        return new Response(
          JSON.stringify({ error: "Il contatto non ha un numero di telefono" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get WhatsApp config for the company
      const { data: waConfig } = await adminClient
        .from("messaging_whatsapp_config")
        .select("phone_number_id, access_token_encrypted")
        .eq("company_id", contact.company_id)
        .eq("is_connected", true)
        .limit(1)
        .single();

      if (!waConfig?.phone_number_id || !waConfig?.access_token_encrypted) {
        return new Response(
          JSON.stringify({ error: "WhatsApp non configurato per questa azienda" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Decrypt access token
      const { decrypt, getEncryptionKey } = await import("../_shared/encryption.ts");
      const encKey = getEncryptionKey();
      const decryptedToken = await decrypt(waConfig.access_token_encrypted, encKey);

      const result = await sendWhatsApp(waConfig.phone_number_id, decryptedToken, contact.phone, content);
      if (!result.ok) {
        status = "failed";
        errorDetail = JSON.stringify(result.body);
      }
    } else if (channel === "sms") {
      // SMS placeholder — no provider configured
      status = "pending";
    }

    // Insert message record
    const { error: insertError } = await adminClient
      .from("contact_messages")
      .insert({
        contact_id,
        company_id: contact.company_id,
        channel,
        content,
        subject: channel === "email" ? (subject || "Messaggio") : null,
        status,
        sent_by: userId,
      });

    if (insertError) {
      console.error("Failed to insert contact_message:", insertError);
    }

    // Log activity
    await adminClient.from("marketing_contact_activities").insert({
      contact_id,
      company_id: contact.company_id,
      activity_type: "message_sent",
      description: `Messaggio ${channel} inviato${status === "failed" ? " (fallito)" : ""}`,
      metadata: { channel, status, error: errorDetail },
      created_by: userId,
    });

    return new Response(
      JSON.stringify({ success: status !== "failed", status, error: errorDetail }),
      {
        status: status === "failed" ? 502 : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
