import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaProvider, loadProviderSettings } from "../_shared/emailProvider.ts";

import { corsHeaders, getCorsHeaders, secureHeaders } from "../_shared/headers.ts";

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { to, testMode, stream, subject, html, campaignId, previewContactId } = body;

    if (!to) {
      return new Response(
        JSON.stringify({ error: "Parametro mancante: to" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Determine stream and load settings
    const providerStream = stream || "marketing";
    const settings = await loadProviderSettings(providerStream);

    if (!settings.apiKey) {
      return new Response(
        JSON.stringify({ error: `API Key non configurata per stream "${providerStream}". Vai in Impostazioni → Email Provider.` }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // If testMode (Super Admin panel), send directly without campaign lookup
    if (testMode) {
      const result = await sendViaProvider(settings.provider, settings.apiKey, {
        from: settings.fromDefault,
        to: [to],
        subject: subject || `[TEST] Email di verifica`,
        html: html || `<html><body><p>Test email</p></body></html>`,
      });

      return new Response(JSON.stringify(result.body), {
        status: result.ok ? 200 : result.status,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Campaign test mode: send test of a specific campaign (no credit deduction)
    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: "Parametri mancanti: campaignId o testMode" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: campaign, error: campError } = await adminClient
      .from("email_campaigns")
      .select("subject, html_content, sender_email, sender_name")
      .eq("id", campaignId)
      .single();

    if (campError || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campagna non trovata" }),
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const fromAddress = campaign.sender_email
      ? campaign.sender_name
        ? `${campaign.sender_name} <${campaign.sender_email}>`
        : campaign.sender_email
      : settings.fromDefault;

    let htmlBody = campaign.html_content ||
      `<html><body><p>Nessun contenuto HTML disponibile.</p></body></html>`;

    // GAP-20: substitute variables using previewContactId data or placeholder values
    let previewContact: Record<string, string> = {
      first_name: "Mario",
      last_name: "Rossi",
      email: to,
      phone: "+39 333 1234567",
      city: "Milano",
      province: "MI",
      company_name: "Azienda Esempio",
    };

    if (previewContactId) {
      const { data: ct } = await adminClient
        .from("marketing_contacts")
        .select("first_name, last_name, email, phone, city, province, company_name")
        .eq("id", previewContactId)
        .maybeSingle();
      if (ct) previewContact = { ...previewContact, ...ct };
    }

    htmlBody = htmlBody
      .replace(/\{\{first_name\}\}/g, previewContact.first_name || "")
      .replace(/\{\{last_name\}\}/g, previewContact.last_name || "")
      .replace(/\{\{email\}\}/g, previewContact.email || "")
      .replace(/\{\{contact\.first_name\}\}/g, previewContact.first_name || "")
      .replace(/\{\{contact\.last_name\}\}/g, previewContact.last_name || "")
      .replace(/\{\{contact\.email\}\}/g, previewContact.email || "")
      .replace(/\{\{phone\}\}/g, previewContact.phone || "")
      .replace(/\{\{city\}\}/g, previewContact.city || "")
      .replace(/\{\{province\}\}/g, previewContact.province || "")
      .replace(/\{\{contact_company\}\}/g, previewContact.company_name || "")
      .replace(/\{\{unsubscribe_url\}\}/g, "#"); // placeholder for test

    const result = await sendViaProvider(settings.provider, settings.apiKey, {
      from: fromAddress,
      to: [to],
      subject: `[TEST] ${campaign.subject || "Senza oggetto"}`,
      html: htmlBody,
    });

    return new Response(JSON.stringify(result.body), {
      status: result.ok ? 200 : result.status,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
