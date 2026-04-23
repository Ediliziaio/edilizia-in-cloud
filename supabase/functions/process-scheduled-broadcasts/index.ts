// MP03 — process-scheduled-broadcasts (cron ogni 1min)
// Processa broadcasts con scheduled_at ≤ NOW. Rispetta opt-out + rate limit 60/min/numero.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

const MAX_PER_TICK_PER_NUMBER = 60;
const MAX_BROADCASTS_PER_TICK = 5;

function extractJwtRole(authHeader: string): string | null {
  if (!authHeader.startsWith("Bearer ")) return null;
  const jwt = authHeader.substring(7);
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET") ?? "";
  const roleClaim = extractJwtRole(authHeader);
  const authorized =
    roleClaim === "service_role" ||
    (internalSecret.length > 0 && cronSecret === internalSecret);
  if (!authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const NOW = new Date();
  const NOW_ISO = NOW.toISOString();

  const { data: broadcasts } = await supabase
    .from("whatsapp_broadcasts")
    .select("*")
    .in("status", ["scheduled", "sending"])
    .lte("scheduled_at", NOW_ISO)
    .limit(MAX_BROADCASTS_PER_TICK);

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const b of broadcasts ?? []) {
    if (b.status === "scheduled") {
      await supabase
        .from("whatsapp_broadcasts")
        .update({ status: "sending", started_at: NOW_ISO })
        .eq("id", b.id);
    }

    const { data: recipients } = await supabase
      .from("whatsapp_broadcast_recipients")
      .select("id, contact_id, phone_number, variables")
      .eq("broadcast_id", b.id)
      .eq("status", "pending")
      .limit(MAX_PER_TICK_PER_NUMBER);

    if (!recipients || recipients.length === 0) {
      await supabase
        .from("whatsapp_broadcasts")
        .update({ status: "completed", completed_at: NOW_ISO })
        .eq("id", b.id);
      continue;
    }

    // Opt-out check in bulk
    const contactIds = recipients.filter((r) => r.contact_id).map((r) => r.contact_id as string);
    const { data: optOuts } = await supabase
      .from("marketing_contacts")
      .select("id, opt_out")
      .in("id", contactIds);
    const optOutSet = new Set((optOuts ?? []).filter((c) => c.opt_out).map((c) => c.id));

    for (const r of recipients) {
      processed++;

      if (r.contact_id && optOutSet.has(r.contact_id)) {
        await supabase
          .from("whatsapp_broadcast_recipients")
          .update({ status: "skipped_opt_out" })
          .eq("id", r.id);
        skipped++;
        continue;
      }

      try {
        const sendResp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              wa_number_id: b.wa_number_id,
              company_id: b.company_id,
              to: r.phone_number,
              template: {
                name: b.template_name,
                language: "it",
                variables: r.variables ?? {},
              },
            }),
          },
        );

        if (sendResp.ok) {
          await supabase
            .from("whatsapp_broadcast_recipients")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", r.id);
          sent++;
        } else {
          const txt = await sendResp.text();
          await supabase
            .from("whatsapp_broadcast_recipients")
            .update({
              status: "failed",
              error_message: txt.substring(0, 500),
            })
            .eq("id", r.id);
          failed++;
        }
      } catch (e) {
        await supabase
          .from("whatsapp_broadcast_recipients")
          .update({ status: "failed", error_message: String(e).substring(0, 500) })
          .eq("id", r.id);
        failed++;
      }

      // Rate limit: 1 sec tra messaggi
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return new Response(
    JSON.stringify({
      ts: NOW_ISO,
      processed,
      sent,
      failed,
      skipped,
      broadcasts: broadcasts?.length ?? 0,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
