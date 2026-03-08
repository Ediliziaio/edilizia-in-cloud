import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
// meta-health-check does not use META_APP_ID/SECRET directly (only checks DB state)
// No getMetaCredentials import needed here

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: integrations, error: intErr } = await admin
      .from("integrations")
      .select("id, company_id, status, health, last_sync_at, updated_at")
      .eq("provider", "meta")
      .in("status", ["connected", "error", "token_expired"]);

    if (intErr) throw intErr;

    const now = new Date();
    const results: { id: string; newHealth: string; newStatus?: string; reason?: string }[] = [];

    for (const integ of integrations || []) {
      let newHealth: "ok" | "warn" | "critical" = "ok";
      let newStatus: string | undefined;
      let reason: string | undefined;

      const { data: creds } = await admin
        .from("integration_credentials")
        .select("expires_at")
        .eq("integration_id", integ.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (creds?.expires_at) {
        const expiresAt = new Date(creds.expires_at);
        const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

        if (daysUntilExpiry <= 0) {
          newHealth = "critical";
          newStatus = "token_expired";
          reason = "Token Meta scaduto";
        } else if (daysUntilExpiry <= 7) {
          newHealth = "warn";
          reason = `Token scade tra ${Math.ceil(daysUntilExpiry)} giorni`;
        }
      }

      if (newHealth !== "critical") {
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const { count: failedCount } = await admin
          .from("integration_webhook_events")
          .select("id", { count: "exact", head: true })
          .eq("integration_id", integ.id)
          .eq("status", "failed")
          .gte("received_at", yesterday);

        if ((failedCount || 0) >= 10) {
          newHealth = "critical";
          reason = `${failedCount} eventi falliti nelle ultime 24h`;
        } else if ((failedCount || 0) >= 3) {
          newHealth = "warn";
          reason = reason || `${failedCount} eventi falliti nelle ultime 24h`;
        }
      }

      if (newHealth !== integ.health || (newStatus && newStatus !== integ.status)) {
        const updateData: Record<string, any> = {
          health: newHealth,
          updated_at: now.toISOString(),
        };
        if (newStatus) {
          updateData.status = newStatus;
          updateData.last_error_message = reason;
        }

        await admin.from("integrations").update(updateData).eq("id", integ.id);

        await admin.from("integration_audit_log").insert({
          company_id: integ.company_id,
          action: "health_check",
          entity_type: "integration",
          entity_id: integ.id,
          metadata: { old_health: integ.health, new_health: newHealth, reason },
        });

        results.push({ id: integ.id, newHealth, newStatus, reason });
      }
    }

    return new Response(
      JSON.stringify({ checked: (integrations || []).length, updated: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("meta-health-check error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
