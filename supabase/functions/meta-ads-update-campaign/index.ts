// supabase/functions/meta-ads-update-campaign/index.ts
//
// Aggiorna una campagna Meta esistente. Operazioni supportate:
//   • pause      → status=PAUSED
//   • activate   → status=ACTIVE (solo company_admin)
//   • archive    → status=ARCHIVED
//   • update     → modifica name / daily_budget / end_time / status
//   • duplicate  → copia la campagna (status=PAUSED, nuovo nome "[COPIA] ...")
//
// SICUREZZA:
//   • Bearer token utente
//   • Validazione company ownership
//   • activate richiede company_admin o super_admin
//   • Spend guard check su update budget

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";

interface UpdateRequest {
  company_id: string;
  campaign_id: string; // UUID locale meta_campaigns.id
  action: "pause" | "activate" | "archive" | "update" | "duplicate";
  patch?: {
    name?: string;
    daily_budget_cents?: number;
    end_time?: string;
    status?: "ACTIVE" | "PAUSED";
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, corsHeaders);
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user: authUser }, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !authUser) return json({ error: "unauthorized" }, 401, corsHeaders);

    let body: UpdateRequest;
    try {
      body = (await req.json()) as UpdateRequest;
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }
    if (!body.company_id || !body.campaign_id || !body.action) {
      return json({ error: "missing_required_fields" }, 400, corsHeaders);
    }

    // AUTHZ
    const [profileRes, rolesRes] = await Promise.all([
      admin.from("profiles").select("company_id").eq("id", authUser.id).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", authUser.id),
    ]);
    const roles = (rolesRes.data ?? []).map((r) => r.role);
    const isSuperAdmin = roles.includes("super_admin");
    const isCompanyAdmin = roles.includes("company_admin");

    if (!isSuperAdmin && profileRes.data?.company_id !== body.company_id) {
      return json({ error: "forbidden_company_mismatch" }, 403, corsHeaders);
    }
    if (body.action === "activate" && !isSuperAdmin && !isCompanyAdmin) {
      return json({ error: "forbidden_requires_company_admin" }, 403, corsHeaders);
    }

    // LOAD CAMPAIGN
    const { data: campaign, error: campErr } = await admin
      .from("meta_campaigns")
      .select("id, meta_campaign_id, integration_id, ad_account_id, builder_state, name")
      .eq("id", body.campaign_id)
      .eq("company_id", body.company_id)
      .maybeSingle();
    if (campErr || !campaign) {
      return json({ error: "campaign_not_found" }, 404, corsHeaders);
    }

    // ACTIONS che non richiedono Meta API (su draft)
    if (!campaign.meta_campaign_id) {
      if (body.action === "archive") {
        await admin.from("meta_campaigns").update({ status: "archived" }).eq("id", body.campaign_id);
        return json({ success: true, action: body.action, mode: "local_only" }, 200, corsHeaders);
      }
      if (body.action === "update") {
        await admin
          .from("meta_campaigns")
          .update({
            name: body.patch?.name ?? campaign.name,
            daily_budget_cents: body.patch?.daily_budget_cents,
          })
          .eq("id", body.campaign_id);
        return json({ success: true, action: body.action, mode: "local_only" }, 200, corsHeaders);
      }
      if (body.action === "duplicate") {
        const newName = `[COPIA] ${campaign.name}`;
        const { data: dup } = await admin
          .from("meta_campaigns")
          .insert({
            company_id: body.company_id,
            integration_id: campaign.integration_id,
            ad_account_id: campaign.ad_account_id,
            name: newName,
            objective: "OUTCOME_LEADS",
            status: "draft",
            budget_mode: "adset",
            builder_state: campaign.builder_state,
            created_by: authUser.id,
          })
          .select("id")
          .single();
        return json({ success: true, action: "duplicate", new_campaign_id: dup?.id }, 200, corsHeaders);
      }
      return json({ error: "action_requires_published_campaign" }, 400, corsHeaders);
    }

    // ACTIONS che richiedono Meta API
    const { data: integration } = await admin
      .from("integrations")
      .select("access_token_encrypted, status")
      .eq("id", campaign.integration_id)
      .maybeSingle();
    if (!integration?.access_token_encrypted) {
      return json({ error: "integration_token_missing" }, 400, corsHeaders);
    }
    const encKey = await getEncryptionKey();
    const accessToken = await decrypt(integration.access_token_encrypted, encKey);

    let metaPayload: Record<string, unknown> = {};
    let localUpdate: Record<string, unknown> = {};

    switch (body.action) {
      case "pause":
        metaPayload = { status: "PAUSED" };
        localUpdate = { status: "paused" };
        break;
      case "activate":
        metaPayload = { status: "ACTIVE" };
        localUpdate = { status: "active" };
        break;
      case "archive":
        metaPayload = { status: "ARCHIVED" };
        localUpdate = { status: "archived" };
        break;
      case "update":
        if (body.patch?.name) {
          metaPayload.name = body.patch.name;
          localUpdate.name = body.patch.name;
        }
        if (body.patch?.daily_budget_cents != null) {
          // SPEND GUARD anche sull'update: prima si poteva alzare il budget
          // di una campagna ATTIVA oltre cap/soglia senza alcun controllo
          // (il guard esisteva solo in create-campaign).
          const { data: guards } = await admin
            .from("ad_spend_guard")
            .select("*")
            .eq("company_id", body.company_id)
            .or(`ad_account_id.eq.${campaign.ad_account_id},ad_account_id.is.null`);
          const guard = (guards ?? []).find((g: { ad_account_id: string | null }) => g.ad_account_id === campaign.ad_account_id)
            ?? (guards ?? []).find((g: { ad_account_id: string | null }) => g.ad_account_id === null);
          if (guard?.is_active) {
            if (body.patch.daily_budget_cents > guard.campaign_approval_threshold_cents && !isSuperAdmin) {
              return json({
                error: "spend_guard_block",
                detail: `Budget ${(body.patch.daily_budget_cents / 100).toFixed(0)}€/g sopra la soglia approvazione (${(guard.campaign_approval_threshold_cents / 100).toFixed(0)}€/g). Serve super_admin.`,
              }, 403, corsHeaders);
            }
            if (body.patch.daily_budget_cents > guard.daily_cap_cents) {
              return json({
                error: "spend_guard_block",
                detail: `Budget ${(body.patch.daily_budget_cents / 100).toFixed(0)}€/g supera il cap giornaliero (${(guard.daily_cap_cents / 100).toFixed(0)}€/g).`,
              }, 403, corsHeaders);
            }
          }
          metaPayload.daily_budget = body.patch.daily_budget_cents;
          localUpdate.daily_budget_cents = body.patch.daily_budget_cents;
        }
        if (body.patch?.end_time) {
          metaPayload.end_time = body.patch.end_time;
          localUpdate.stop_time = body.patch.end_time;
        }
        if (body.patch?.status) {
          metaPayload.status = body.patch.status;
          localUpdate.status = body.patch.status.toLowerCase();
        }
        break;
      case "duplicate": {
        // Duplica via Meta API: GET originale → POST copia
        // Per ora duplica solo locale (la versione live richiede deep copy ad_sets/creatives/ads)
        const newName = `[COPIA] ${campaign.name}`;
        const { data: dup } = await admin
          .from("meta_campaigns")
          .insert({
            company_id: body.company_id,
            integration_id: campaign.integration_id,
            ad_account_id: campaign.ad_account_id,
            name: newName,
            objective: "OUTCOME_LEADS",
            status: "draft",
            budget_mode: "adset",
            builder_state: campaign.builder_state,
            created_by: authUser.id,
          })
          .select("id")
          .single();
        return json({
          success: true,
          action: "duplicate",
          new_campaign_id: dup?.id,
          note: "Duplicato solo locale. Per duplicare live serve pubblicarlo separatamente.",
        }, 200, corsHeaders);
      }
    }

    // Esegui call Meta API
    const url = `https://graph.facebook.com/${apiVersion}/${campaign.meta_campaign_id}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...metaPayload, access_token: accessToken }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return json({
        error: "meta_api_error",
        detail: text.substring(0, 500),
      }, 502, corsHeaders);
    }

    // Aggiorna DB
    await admin
      .from("meta_campaigns")
      .update({ ...localUpdate, last_synced_at: new Date().toISOString() })
      .eq("id", body.campaign_id);

    return json({ success: true, action: body.action }, 200, corsHeaders);
  } catch (e) {
    console.error("[meta-ads-update-campaign] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
