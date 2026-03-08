import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaProvider, loadProviderSettings } from "../_shared/emailProvider.ts";
import { deductEmailCredits } from "../_shared/emailCredits.ts";

import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { campaignId } = body;

    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: "Parametro mancante: campaignId" }),
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
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campError || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campagna non trovata" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (campaign.status === "sent" || campaign.status === "sending") {
      return new Response(
        JSON.stringify({ error: "Campagna già inviata o in fase di invio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = campaign.company_id;

    // Mark campaign as sending
    await adminClient
      .from("email_campaigns")
      .update({ status: "sending", sent_at: new Date().toISOString() })
      .eq("id", campaignId);

    // Load provider settings
    const settings = await loadProviderSettings("marketing");
    if (!settings.apiKey) {
      await adminClient.from("email_campaigns").update({ status: "failed" }).eq("id", campaignId);
      return new Response(
        JSON.stringify({ error: "API Key del provider email marketing non configurata" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build recipient list
    let query = adminClient
      .from("marketing_contacts")
      .select("id, email, first_name, last_name")
      .eq("company_id", companyId)
      .eq("email_unsubscribed", false)
      .not("email", "is", null);

    // Apply segment filters if present
    if (campaign.segment_json) {
      const seg = typeof campaign.segment_json === "string"
        ? JSON.parse(campaign.segment_json)
        : campaign.segment_json;

      if (seg.tags?.length) {
        query = query.overlaps("tags", seg.tags);
      }
      if (seg.source) {
        query = query.eq("source", seg.source);
      }
      if (seg.contact_type) {
        query = query.eq("contact_type", seg.contact_type);
      }
    }

    // Apply recipient_filter (legacy)
    if (campaign.recipient_filter) {
      const filter = typeof campaign.recipient_filter === "string"
        ? JSON.parse(campaign.recipient_filter)
        : campaign.recipient_filter;

      if (filter.tags?.length) {
        query = query.overlaps("tags", filter.tags);
      }
    }

    const { data: contacts, error: contactsError } = await query;
    if (contactsError) {
      await adminClient.from("email_campaigns").update({ status: "failed" }).eq("id", campaignId);
      return new Response(
        JSON.stringify({ error: "Errore nel recupero dei contatti: " + contactsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recipients = (contacts ?? []).filter((c: any) => c.email);

    if (recipients.length === 0) {
      await adminClient.from("email_campaigns").update({ status: "failed", failed_count: 0, sent_count: 0 }).eq("id", campaignId);
      return new Response(
        JSON.stringify({ error: "Nessun destinatario trovato", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduct credits upfront
    const emailCost = recipients.length; // 1 credit = 1 email
    try {
      await deductEmailCredits(companyId, emailCost, {
        description: `Campagna: ${campaign.name}`,
        campaignId,
        adminClient,
      });
    } catch (creditError: any) {
      await adminClient.from("email_campaigns").update({ status: "failed" }).eq("id", campaignId);
      return new Response(
        JSON.stringify({ error: "Crediti insufficienti: " + creditError.message }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build from address
    const fromAddress = campaign.sender_email
      ? campaign.sender_name
        ? `${campaign.sender_name} <${campaign.sender_email}>`
        : campaign.sender_email
      : settings.fromDefault;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    let sentCount = 0;
    let failedCount = 0;

    // Send emails in parallel batches of 5
    const BATCH_SIZE = 5;

    async function sendToContact(contact: any) {
      try {
        // Personalize HTML
        let html = campaign.html_content || "<p>Nessun contenuto</p>";
        html = html
          .replace(/\{\{first_name\}\}/g, contact.first_name || "")
          .replace(/\{\{last_name\}\}/g, contact.last_name || "")
          .replace(/\{\{email\}\}/g, contact.email || "");

        // Add tracking pixel
        const trackingPixelUrl = `${supabaseUrl}/functions/v1/email-tracking?type=open&cid=${campaignId}&rid=${contact.id}&co=${companyId}`;
        html += `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`;

        // Wrap links for click tracking
        html = html.replace(
          /href="(https?:\/\/[^"]+)"/g,
          (_match: string, url: string) => {
            const trackUrl = `${supabaseUrl}/functions/v1/email-tracking?type=click&cid=${campaignId}&rid=${contact.id}&co=${companyId}&url=${encodeURIComponent(url)}`;
            return `href="${trackUrl}"`;
          }
        );

        // Add unsubscribe link
        const unsubUrl = `${supabaseUrl}/functions/v1/email-tracking?type=unsub&cid=${campaignId}&rid=${contact.id}&co=${companyId}`;
        const unsubHeader = `<${unsubUrl}>`;

        const result = await sendViaProvider(settings.provider, settings.apiKey, {
          from: fromAddress,
          to: [contact.email],
          subject: campaign.subject || "Senza oggetto",
          html,
          headers: {
            "List-Unsubscribe": unsubHeader,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }, { domain: settings.domain });

        // Log the send
        await adminClient.from("email_logs").insert({
          campaign_id: campaignId,
          contact_id: contact.id,
          company_id: companyId,
          status: result.ok ? "delivered" : "failed",
          provider: settings.provider,
          provider_message_id: result.providerMessageId || null,
          stream: "marketing",
          event_timestamp: new Date().toISOString(),
          error_message: result.ok ? null : JSON.stringify(result.body),
        });

        return result.ok;
      } catch (err: any) {
        await adminClient.from("email_logs").insert({
          campaign_id: campaignId,
          contact_id: contact.id,
          company_id: companyId,
          status: "failed",
          provider: settings.provider,
          stream: "marketing",
          event_timestamp: new Date().toISOString(),
          error_message: err.message,
        });
        return false;
      }
    }

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(sendToContact));
      for (const ok of results) {
        if (ok) sentCount++;
        else failedCount++;
      }
    }

    // Update campaign status
    await adminClient
      .from("email_campaigns")
      .update({
        status: failedCount === recipients.length ? "failed" : "sent",
        sent_count: sentCount,
        failed_count: failedCount,
        credits_used: emailCost,
        completed_at: new Date().toISOString(),
        total_recipients: recipients.length,
      })
      .eq("id", campaignId);

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, failed: failedCount, total: recipients.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
