// supabase/functions/meta-ads-update-campaign/index.ts
//
// Aggiorna una campagna Meta esistente. Operazioni supportate:
//   • pause      → status=PAUSED
//   • activate   → status=ACTIVE (solo company_admin). Accende anche ad set e
//                  annunci: nascono tutti in PAUSED e con la sola campagna
//                  attiva Meta non mostrava niente.
//   • archive    → status=ARCHIVED
//   • update     → modifica name / daily_budget / end_time / status
//   • duplicate  → copia la campagna (status=PAUSED, nuovo nome "[COPIA] ...")
//
// SICUREZZA:
//   • Bearer token utente
//   • Validazione company ownership
//   • activate richiede company_admin o super_admin
//   • activate/update solo se l'account pubblicitario è ancora quello scelto
//     dall'azienda (meta_assets selected). La pausa passa sempre: fermare la
//     spesa non deve mai essere bloccato.
//   • Spend guard check su update budget
//
// ERRORI: `detail` è sempre una frase in italiano (vedi traduciErroreMeta).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { normalizzaActId, traduciErroreMeta, type ErroreMetaLeggibile } from "../_shared/metaAdsPubblicazione.ts";

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
      return json({
        error: "forbidden_requires_company_admin",
        detail: "Solo il titolare può mandare online una campagna.",
      }, 403, corsHeaders);
    }

    // LOAD CAMPAIGN
    const { data: campaign, error: campErr } = await admin
      .from("meta_campaigns")
      .select("id, meta_campaign_id, integration_id, ad_account_id, builder_state, name, approved_at")
      .eq("id", body.campaign_id)
      .eq("company_id", body.company_id)
      .maybeSingle();
    if (campErr || !campaign) {
      return json({ error: "campaign_not_found", detail: "Campagna non trovata." }, 404, corsHeaders);
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
      return json({
        error: "action_requires_published_campaign",
        detail: "La campagna non è ancora su Meta: pubblicala prima.",
      }, 400, corsHeaders);
    }

    // L'account deve essere ancora quello scelto dall'azienda, tranne per
    // fermare o archiviare: quelli devono passare sempre.
    if (body.action === "activate" || body.action === "update") {
      const ancoraScelto = await accountAncoraScelto(admin, body.company_id, campaign.ad_account_id);
      if (!ancoraScelto) {
        return json({
          error: "ad_account_not_selected",
          detail: "L'account pubblicitario di questa campagna non è più quello scelto per l'azienda: controllalo nelle Integrazioni Meta.",
        }, 403, corsHeaders);
      }
    }

    // ACTIONS che richiedono Meta API
    // Il token Meta vive su integration_credentials (AES-GCM), non su
    // integrations. Se la campagna ha perso integration_id (FK SET NULL dopo
    // una ricollegata) si usa l'integrazione Meta attuale dell'azienda.
    const accessToken = await tokenMeta(admin, body.company_id, campaign.integration_id);
    if (!accessToken) {
      return json({
        error: "integration_token_missing",
        detail: "Il collegamento con Meta non ha un token valido: ricollega Meta dalle Integrazioni.",
      }, 400, corsHeaders);
    }

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
            // Sopra la soglia serve l'ok del TITOLARE, non dell'amministratore
            // della piattaforma: chiedere un super_admin qui significava che
            // nessun cliente poteva alzare il budget della propria campagna.
            if (
              guard.campaign_approval_threshold_cents > 0 &&
              body.patch.daily_budget_cents > guard.campaign_approval_threshold_cents &&
              !isSuperAdmin &&
              !campaign.approved_at
            ) {
              const soglia = (guard.campaign_approval_threshold_cents / 100).toFixed(0);
              return json({
                error: "spend_guard_block",
                detail: `Budget ${(body.patch.daily_budget_cents / 100).toFixed(0)} €/giorno sopra la soglia di ${soglia} €/giorno: manda la campagna in revisione e fatti dare l'ok dal titolare.`,
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

    // ATTIVAZIONE: prima annunci e ad set, per ultima la campagna. Se un figlio
    // non si accende la campagna resta ferma, e non spende a metà.
    if (body.action === "activate") {
      const { data: adSets } = await admin
        .from("meta_ad_sets")
        .select("id, meta_adset_id, status")
        .eq("campaign_id", campaign.id)
        .not("meta_adset_id", "is", null);
      const adSetAttivabili = (adSets ?? []).filter((a) => !["archived", "deleted"].includes(String(a.status ?? "")));
      const adSetIds = adSetAttivabili.map((a) => a.id);
      const { data: ads } = adSetIds.length
        ? await admin
          .from("meta_ads")
          .select("id, meta_ad_id, status")
          .in("adset_id", adSetIds)
          .not("meta_ad_id", "is", null)
        : { data: [] as { id: string; meta_ad_id: string; status: string | null }[] };
      const adsAttivabili = (ads ?? []).filter((a) => !["archived", "deleted"].includes(String(a.status ?? "")));

      for (const ad of adsAttivabili) {
        const r = await aggiornaSuMeta(ad.meta_ad_id, accessToken, { status: "ACTIVE" });
        if (!r.ok) {
          return errorePerMeta(`Annuncio non attivato, la campagna resta ferma. ${r.errore.messaggio}`, r.errore, corsHeaders);
        }
      }
      for (const adSet of adSetAttivabili) {
        const r = await aggiornaSuMeta(adSet.meta_adset_id, accessToken, { status: "ACTIVE" });
        if (!r.ok) {
          return errorePerMeta(`Ad set non attivato, la campagna resta ferma. ${r.errore.messaggio}`, r.errore, corsHeaders);
        }
      }
      const adesso = new Date().toISOString();
      if (adsAttivabili.length > 0) {
        await admin.from("meta_ads").update({ status: "active", last_synced_at: adesso }).in("id", adsAttivabili.map((a) => a.id));
      }
      if (adSetIds.length > 0) {
        await admin.from("meta_ad_sets").update({ status: "active", last_synced_at: adesso }).in("id", adSetIds);
      }
    }

    // Esegui call Meta API sulla campagna
    const esito = await aggiornaSuMeta(campaign.meta_campaign_id, accessToken, metaPayload);
    if (!esito.ok) {
      return errorePerMeta(esito.errore.messaggio, esito.errore, corsHeaders);
    }

    // Aggiorna DB
    await admin
      .from("meta_campaigns")
      .update({ ...localUpdate, last_synced_at: new Date().toISOString() })
      .eq("id", body.campaign_id);

    return json({ success: true, action: body.action }, 200, corsHeaders);
  } catch (e) {
    console.error("[meta-ads-update-campaign] uncaught", e);
    return json({ error: "internal_error", detail: `Errore interno: ${String(e)}` }, 500, corsHeaders);
  }
});

/** Token Meta in chiaro per l'integrazione della campagna (o quella attuale dell'azienda). */
async function tokenMeta(
  // deno-lint-ignore no-explicit-any
  admin: any,
  companyId: string,
  integrationId: string | null,
): Promise<string | null> {
  let id = integrationId;
  if (!id) {
    const { data } = await admin
      .from("integrations")
      .select("id")
      .eq("company_id", companyId)
      .eq("provider", "meta")
      .maybeSingle();
    id = data?.id ?? null;
  }
  if (!id) return null;
  const { data: cred } = await admin
    .from("integration_credentials")
    .select("access_token_encrypted")
    .eq("integration_id", id)
    .maybeSingle();
  if (!cred?.access_token_encrypted) return null;
  try {
    return await decrypt(cred.access_token_encrypted, await getEncryptionKey());
  } catch (e) {
    console.warn("[meta-ads-update-campaign] decrypt failed", e);
    return null;
  }
}

/**
 * L'account della campagna è ancora tra quelli scelti in meta_assets?
 * Senza una scelta registrata (aziende con la sola meta_ad_accounts) non si blocca.
 */
async function accountAncoraScelto(
  // deno-lint-ignore no-explicit-any
  admin: any,
  companyId: string,
  adAccountUuid: string | null,
): Promise<boolean> {
  if (!adAccountUuid) return true;
  const { data: riga } = await admin
    .from("meta_ad_accounts")
    .select("ad_account_id")
    .eq("id", adAccountUuid)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!riga?.ad_account_id) return true;
  const { data: scelti } = await admin
    .from("meta_assets")
    .select("asset_id")
    .eq("company_id", companyId)
    .eq("asset_type", "ad_account")
    .eq("selected", true);
  if (!scelti || scelti.length === 0) return true;
  const act = normalizzaActId(riga.ad_account_id);
  return (scelti as { asset_id: string }[]).some((s) => normalizzaActId(s.asset_id) === act);
}

async function aggiornaSuMeta(
  objectId: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; errore: ErroreMetaLeggibile }> {
  try {
    const resp = await fetch(`https://graph.facebook.com/${apiVersion}/${objectId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, access_token: accessToken }),
    });
    const testo = await resp.text();
    let corpo: unknown = null;
    try {
      corpo = JSON.parse(testo);
    } catch {
      corpo = null;
    }
    if (!resp.ok || (corpo as { error?: unknown } | null)?.error) {
      return { ok: false, errore: traduciErroreMeta(corpo ?? testo) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: { codice: "errore_meta", messaggio: `Meta non raggiungibile: ${String(e)}` } };
  }
}

function errorePerMeta(
  detail: string,
  errore: ErroreMetaLeggibile,
  corsHeaders: Record<string, string>,
): Response {
  return json({
    error: "meta_api_error",
    detail,
    codice: errore.codice,
    codice_meta: errore.codice_meta ?? null,
  }, errore.codice === "permesso_mancante" || errore.codice === "token_scaduto" ? 403 : 502, corsHeaders);
}

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
