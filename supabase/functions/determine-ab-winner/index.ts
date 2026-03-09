import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // CRON_SECRET validation (optional — if configured, reject unauthenticated calls)
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    if (expectedSecret && cronSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find campaigns that are A/B tests, already sent, past their duration window, with no winner yet
    // Also handle campaigns where completed_at is null by falling back to sent_at
    const { data: campaigns, error: campError } = await adminClient
      .from("email_campaigns")
      .select("id, ab_winner_criteria, ab_test_duration_hours, completed_at, sent_at, company_id, name")
      .eq("ab_test_enabled", true)
      .eq("status", "sent")
      .is("ab_winner", null);

    if (campError) throw campError;

    let determined = 0;

    for (const campaign of campaigns || []) {
      const completedAt = new Date(campaign.completed_at);
      const durationHours = campaign.ab_test_duration_hours ?? 4;
      const cutoff = new Date(completedAt.getTime() + durationHours * 60 * 60 * 1000);

      if (new Date() < cutoff) continue; // Not yet time to decide

      // Get logs for this campaign grouped by variant
      const { data: logs, error: logsError } = await adminClient
        .from("email_logs")
        .select("ab_variant, status")
        .eq("campaign_id", campaign.id);

      if (logsError) continue;

      const variantA = (logs || []).filter((l: any) => l.ab_variant === "A");
      const variantB = (logs || []).filter((l: any) => l.ab_variant === "B");

      if (variantA.length === 0 && variantB.length === 0) continue;

      let winner: "A" | "B" = "A";

      if (campaign.ab_winner_criteria === "click_rate") {
        const clicksA = variantA.filter((l: any) => l.status === "clicked").length;
        const clicksB = variantB.filter((l: any) => l.status === "clicked").length;
        const rateA = variantA.length > 0 ? clicksA / variantA.length : 0;
        const rateB = variantB.length > 0 ? clicksB / variantB.length : 0;
        winner = rateB > rateA ? "B" : "A";
      } else {
        // Default: open_rate
        const opensA = variantA.filter((l: any) => l.status === "opened" || l.status === "clicked").length;
        const opensB = variantB.filter((l: any) => l.status === "opened" || l.status === "clicked").length;
        const rateA = variantA.length > 0 ? opensA / variantA.length : 0;
        const rateB = variantB.length > 0 ? opensB / variantB.length : 0;
        winner = rateB > rateA ? "B" : "A";
      }

      await adminClient
        .from("email_campaigns")
        .update({ ab_winner: winner })
        .eq("id", campaign.id);

      determined++;
    }

    return new Response(
      JSON.stringify({ success: true, determined }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
