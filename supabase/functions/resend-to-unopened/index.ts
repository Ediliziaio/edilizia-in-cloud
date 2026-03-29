/**
 * resend-to-unopened — BUG-06
 *
 * Cron function that finds sent campaigns with resend_to_unopened=true
 * where the configured delay has passed, then re-sends to contacts who
 * received the email but never opened it.
 *
 * The function creates a clone of the original campaign (with a modified
 * subject like "Hai perso questa email?") and sends only to non-openers.
 *
 * Auth: x-cron-secret header (CRON_SECRET env var).
 * Suggested schedule: every 30 minutes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProviderSettings, sendViaProvider } from "../_shared/emailProvider.ts";
import { corsHeaders } from "../_shared/headers.ts";

// How many hours after campaign completion to re-send to non-openers
const DEFAULT_RESEND_DELAY_HOURS = 24;

// Max contacts to resend per invocation
const BATCH_SIZE = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: cron secret required
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqCronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || reqCronSecret !== cronSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find sent campaigns with resend_to_unopened=true that have no resend done yet
    // We detect "already resent" by checking for a sibling campaign named "*_resend"
    // (simpler than adding a new DB column for this first implementation)
    const cutoffTime = new Date(
      Date.now() - DEFAULT_RESEND_DELAY_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data: campaigns, error: campError } = await adminClient
      .from("email_campaigns")
      .select("id, company_id, name, subject, html_content, sender_name, sender_email, completed_at")
      .eq("status", "sent")
      .eq("resend_to_unopened", true)
      .lte("completed_at", cutoffTime)
      .not("name", "like", "%_resend")  // skip already-created resend campaigns
      .limit(5); // process max 5 campaigns per run

    if (campError) throw campError;

    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = await loadProviderSettings("marketing");
    if (!settings.apiKey) {
      return new Response(
        JSON.stringify({ error: "No API key for marketing stream" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalResent = 0;
    const results: { campaignId: string; resent: number }[] = [];

    for (const campaign of campaigns) {
      // Guard: check if a resend campaign already exists for this one
      const { count: existingResend } = await adminClient
        .from("email_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("company_id", campaign.company_id)
        .like("name", `${campaign.name}_resend`);

      if ((existingResend ?? 0) > 0) continue;

      // Find contacts who received the email but never opened it
      const { data: nonOpeners, error: logsError } = await adminClient
        .from("email_logs")
        .select("contact_id")
        .eq("campaign_id", campaign.id)
        .eq("status", "delivered")
        .is("opened_at", null)
        .limit(BATCH_SIZE);

      if (logsError || !nonOpeners || nonOpeners.length === 0) continue;

      const contactIds = nonOpeners.map((l: any) => l.contact_id);

      // Fetch contact details
      const { data: contacts, error: contactsError } = await adminClient
        .from("marketing_contacts")
        .select("id, email, first_name, last_name")
        .in("id", contactIds)
        .eq("email_unsubscribed", false)
        .not("email", "is", null);

      if (contactsError || !contacts || contacts.length === 0) continue;

      // Create resend campaign record to track this resend
      const resendSubject = campaign.subject
        ? `Hai perso questa email? ${campaign.subject}`
        : "Hai perso questa email?";

      const { data: resendCamp, error: insertError } = await adminClient
        .from("email_campaigns")
        .insert({
          company_id: campaign.company_id,
          name: `${campaign.name}_resend`,
          subject: resendSubject,
          html_content: campaign.html_content,
          sender_name: campaign.sender_name,
          sender_email: campaign.sender_email,
          status: "sending",
          sent_at: new Date().toISOString(),
          total_recipients: contacts.length,
        })
        .select("id")
        .single();

      if (insertError || !resendCamp) continue;

      const resendCampaignId = resendCamp.id;
      const fromAddress = campaign.sender_email
        ? campaign.sender_name
          ? `${campaign.sender_name} <${campaign.sender_email}>`
          : campaign.sender_email
        : settings.fromDefault;

      let sentCount = 0;
      let failedCount = 0;

      for (const contact of contacts) {
        try {
          let html = campaign.html_content || "<p>Nessun contenuto</p>";

          // Personalize
          html = html
            .replace(/\{\{first_name\}\}/g, contact.first_name || "")
            .replace(/\{\{last_name\}\}/g, contact.last_name || "")
            .replace(/\{\{email\}\}/g, contact.email || "");

          // Tracking pixel
          const trackPixel = `${supabaseUrl}/functions/v1/email-tracking?type=open&cid=${resendCampaignId}&rid=${contact.id}&co=${campaign.company_id}`;
          html += `<img src="${trackPixel}" width="1" height="1" style="display:none" alt="" />`;

          // Unsubscribe
          const unsubUrl = `${supabaseUrl}/functions/v1/email-tracking?type=unsub&cid=${resendCampaignId}&rid=${contact.id}&co=${campaign.company_id}`;
          html = html.replace(/\{\{unsubscribe_url\}\}/g, unsubUrl);

          const result = await sendViaProvider(
            settings.provider,
            settings.apiKey,
            {
              from: fromAddress,
              to: [contact.email],
              subject: resendSubject,
              html,
              headers: {
                "List-Unsubscribe": `<${unsubUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            },
            { domain: settings.domain }
          );

          await adminClient.from("email_logs").insert({
            campaign_id: resendCampaignId,
            contact_id: contact.id,
            company_id: campaign.company_id,
            status: result.ok ? "delivered" : "failed",
            provider: settings.provider,
            provider_message_id: result.providerMessageId || null,
            stream: "marketing",
            event_timestamp: new Date().toISOString(),
            error_message: result.ok ? null : JSON.stringify(result.body),
          });

          if (result.ok) sentCount++;
          else failedCount++;
        } catch {
          failedCount++;
        }
      }

      // Update resend campaign status
      await adminClient
        .from("email_campaigns")
        .update({
          status: failedCount === contacts.length ? "failed" : "sent",
          sent_count: sentCount,
          failed_count: failedCount,
          completed_at: new Date().toISOString(),
        })
        .eq("id", resendCampaignId);

      totalResent += sentCount;
      results.push({ campaignId: campaign.id, resent: sentCount });
    }

    return new Response(
      JSON.stringify({ success: true, processed: campaigns.length, totalResent, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
