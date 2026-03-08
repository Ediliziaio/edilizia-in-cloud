import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (!profile?.company_id) return json({ error: "No company" }, 400);

    const companyId = profile.company_id;
    const { campaign_id } = await req.json();
    if (!campaign_id) return json({ error: "campaign_id obbligatorio" }, 400);

    // Load campaign
    const { data: campaign, error: campErr } = await adminClient
      .from("internal_outbound_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .eq("company_id", companyId)
      .single();

    if (campErr || !campaign) return json({ error: "Campagna non trovata" }, 404);

    // Resolve contacts
    let contactIds: string[] = [];

    if (campaign.target_type === "manual" && campaign.contact_ids?.length) {
      contactIds = campaign.contact_ids;
    } else if (campaign.target_type === "filter" && campaign.filter_config) {
      const config = campaign.filter_config as Record<string, unknown>;
      let query = adminClient
        .from("marketing_contacts")
        .select("id")
        .eq("company_id", companyId)
        .not("phone", "is", null)
        .eq("optout_call", false);

      if (config.source) {
        query = query.eq("source", config.source as string);
      }
      if (Array.isArray(config.tags) && (config.tags as string[]).length > 0) {
        query = query.overlaps("tags", config.tags as string[]);
      }

      const { data: filteredContacts } = await query.limit(1000);
      contactIds = (filteredContacts || []).map((c: any) => c.id);
    }

    if (contactIds.length === 0) {
      await adminClient
        .from("internal_outbound_campaigns")
        .update({ status: "completed", completed_at: new Date().toISOString(), total_calls: 0 })
        .eq("id", campaign_id);
      return json({ success: true, message: "Nessun contatto da chiamare", total: 0 });
    }

    // Update campaign status
    await adminClient
      .from("internal_outbound_campaigns")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        total_calls: contactIds.length,
      })
      .eq("id", campaign_id);

    // Process calls with rate limiting
    const callsPerMinute = campaign.calls_per_minute || 2;
    const delayMs = Math.floor(60000 / callsPerMinute);
    let answered = 0;
    let failed = 0;

    for (let i = 0; i < contactIds.length; i++) {
      // Check if campaign was paused
      if (i > 0 && i % 5 === 0) {
        const { data: currentCampaign } = await adminClient
          .from("internal_outbound_campaigns")
          .select("status")
          .eq("id", campaign_id)
          .single();
        if (currentCampaign?.status === "paused") {
          console.log(`[CAMPAIGN] ${campaign_id} paused at contact ${i}/${contactIds.length}`);
          break;
        }
      }

      try {
        // Call initiate-outbound-call with service role
        const callRes = await fetch(`${supabaseUrl}/functions/v1/initiate-outbound-call`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agent_id: campaign.agent_id,
            contact_id: contactIds[i],
            company_id: companyId,
            user_id: user.id,
            skip_subscription_check: false,
          }),
        });

        const callData = await callRes.json();

        if (callRes.ok && callData.success) {
          answered++;
          // Log campaign_id on the call log
          if (callData.conversation_id) {
            await adminClient
              .from("internal_call_logs")
              .update({ campaign_id: campaign_id })
              .eq("elevenlabs_conversation_id", callData.conversation_id);
          }
        } else {
          failed++;
          console.warn(`[CAMPAIGN] Call failed for contact ${contactIds[i]}:`, callData.error);
        }
      } catch (err) {
        failed++;
        console.error(`[CAMPAIGN] Call error for contact ${contactIds[i]}:`, err);
      }

      // Update counters periodically
      if (i % 3 === 0 || i === contactIds.length - 1) {
        await adminClient
          .from("internal_outbound_campaigns")
          .update({ calls_answered: answered, calls_failed: failed })
          .eq("id", campaign_id);
      }

      // Rate limiting delay
      if (i < contactIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    // Finalize campaign
    const { data: finalStatus } = await adminClient
      .from("internal_outbound_campaigns")
      .select("status")
      .eq("id", campaign_id)
      .single();

    if (finalStatus?.status !== "paused") {
      await adminClient
        .from("internal_outbound_campaigns")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          calls_answered: answered,
          calls_failed: failed,
        })
        .eq("id", campaign_id);
    }

    // Audit log
    await adminClient.from("ai_agent_audit_log").insert({
      company_id: companyId,
      agent_id: campaign.agent_id,
      user_id: user.id,
      action: "campaign_completed",
      details: {
        campaign_id,
        total: contactIds.length,
        answered,
        failed,
      },
    });

    return json({
      success: true,
      total: contactIds.length,
      answered,
      failed,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("internal-campaign-manager error:", message);
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: secureHeaders,
  });
}
