// supabase/functions/meta-ads-approval-decide/index.ts
//
// Approva o rifiuta una bozza campagna in stato 'review'.
//
// FLUSSO:
//   • approve → status='published' + trigger publish reale via meta-ads-create-campaign
//   • reject  → status='draft' + log motivazione
//
// SICUREZZA:
//   • Solo company_admin o super_admin
//   • Validazione company ownership
//   • Verifica che la campagna sia in stato 'review'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

interface ApprovalRequest {
  company_id: string;
  campaign_id: string;
  decision: "approve" | "reject";
  reason?: string;
  /** Se true e approvazione, pubblica subito su Meta */
  publish_live?: boolean;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    // AUTH
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "unauthorized" }, 401, corsHeaders);

    let body: ApprovalRequest;
    try {
      body = (await req.json()) as ApprovalRequest;
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }

    if (!body.company_id || !body.campaign_id || !body.decision) {
      return json({ error: "missing_required_fields" }, 400, corsHeaders);
    }
    if (body.decision !== "approve" && body.decision !== "reject") {
      return json({ error: "invalid_decision" }, 400, corsHeaders);
    }

    // AUTHZ — solo admin
    const [profile, roles] = await Promise.all([
      admin.from("profiles").select("company_id, full_name").eq("id", user.id).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    const r = (roles.data ?? []).map((x) => x.role);
    const isSA = r.includes("super_admin");
    const isAdmin = r.includes("company_admin");
    if (!isSA && profile.data?.company_id !== body.company_id) {
      return json({ error: "forbidden" }, 403, corsHeaders);
    }
    if (!isSA && !isAdmin) {
      return json({ error: "forbidden_requires_admin" }, 403, corsHeaders);
    }

    // LOAD CAMPAIGN
    const { data: campaign, error: campErr } = await admin
      .from("meta_campaigns")
      .select("id, name, status, daily_budget_cents, builder_state, ad_account_id, created_by, meta_campaign_id")
      .eq("id", body.campaign_id)
      .eq("company_id", body.company_id)
      .maybeSingle();
    if (campErr || !campaign) {
      return json({ error: "campaign_not_found" }, 404, corsHeaders);
    }

    if (campaign.status !== "review") {
      return json({
        error: "invalid_status",
        detail: `Campagna in stato '${campaign.status}', non 'review'.`,
      }, 400, corsHeaders);
    }

    if (body.decision === "reject") {
      // Torna in draft con motivazione
      await admin
        .from("meta_campaigns")
        .update({
          status: "draft",
          publish_error: body.reason ? `Rifiutata: ${body.reason}` : "Rifiutata dal titolare",
        })
        .eq("id", body.campaign_id);

      return json({
        success: true,
        decision: "reject",
        new_status: "draft",
        reason: body.reason ?? null,
      }, 200, corsHeaders);
    }

    // decision === "approve"
    if (body.publish_live) {
      // STATUS ONESTO: "published" ha senso solo se la campagna esiste GIÀ
      // su Meta (meta_campaign_id presente). Prima veniva marcata published
      // anche senza nulla su Meta → il titolare credeva fosse live.
      const isOnMeta = !!campaign.meta_campaign_id;
      await admin
        .from("meta_campaigns")
        .update(isOnMeta
          ? { status: "published", last_published_at: new Date().toISOString() }
          : { status: "draft", publish_error: null })
        .eq("id", body.campaign_id);

      return json({
        success: true,
        decision: "approve",
        new_status: isOnMeta ? "published" : "draft",
        note: isOnMeta
          ? "Campagna approvata (già presente su Meta)."
          : "Campagna approvata: ora puoi pubblicarla con 'Pubblica su Meta' nella UI.",
      }, 200, corsHeaders);
    }

    // Approva ma resta in draft (l'utente può modificare ancora)
    await admin
      .from("meta_campaigns")
      .update({
        status: "draft",
        publish_error: null,
      })
      .eq("id", body.campaign_id);

    return json({
      success: true,
      decision: "approve",
      new_status: "draft",
    }, 200, corsHeaders);
  } catch (e) {
    console.error("[meta-ads-approval-decide] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
