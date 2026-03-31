/**
 * process-scheduled-campaigns — BUG-05
 *
 * Cron function that picks up campaigns with status='scheduled' whose
 * scheduled_at is in the past and triggers their send by calling
 * send-email-campaign internally.
 *
 * Expected to run every 5 minutes via Supabase cron or pg_cron.
 * Auth: x-cron-secret header (CRON_SECRET env var).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Auth: cron secret required
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqCronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || reqCronSecret !== cronSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find campaigns ready to send: scheduled_at is in the past, status is 'scheduled'
    const { data: campaigns, error: campError } = await adminClient
      .from("email_campaigns")
      .select("id, name, company_id, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .limit(20); // process max 20 per invocation to stay within timeout

    if (campError) throw campError;

    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({ success: true, triggered: 0 }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    let triggered = 0;
    const errors: { id: string; error: string }[] = [];

    for (const campaign of campaigns) {
      try {
        // Mark as sending before triggering to prevent duplicate processing
        const { error: lockError } = await adminClient
          .from("email_campaigns")
          .update({ status: "sending", sent_at: new Date().toISOString() })
          .eq("id", campaign.id)
          .eq("status", "scheduled"); // guard against race condition

        if (lockError) {
          errors.push({ id: campaign.id, error: lockError.message });
          continue;
        }

        // Call send-email-campaign using service role as auth
        // The function requires a user JWT, so we use service role key directly
        const sendRes = await fetch(
          `${supabaseUrl}/functions/v1/send-email-campaign`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ campaignId: campaign.id }),
          }
        );

        if (!sendRes.ok) {
          const errBody = await sendRes.json().catch(() => ({}));
          // Revert to failed if send-email-campaign returned an error
          await adminClient
            .from("email_campaigns")
            .update({ status: "failed" })
            .eq("id", campaign.id);
          errors.push({ id: campaign.id, error: (errBody as any).error || `HTTP ${sendRes.status}` });
        } else {
          triggered++;
        }
      } catch (err: any) {
        await adminClient
          .from("email_campaigns")
          .update({ status: "failed" })
          .eq("id", campaign.id);
        errors.push({ id: campaign.id, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, triggered, errors }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
