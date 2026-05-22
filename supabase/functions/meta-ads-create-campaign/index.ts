// supabase/functions/meta-ads-create-campaign/index.ts
//
// Crea una campagna Meta + ad sets + creatives + ads in modo atomico via
// Meta Marketing Batch API (https://graph.facebook.com/v21.0/?batch=[...]).
//
// MODALITÀ:
//   • dry_run=true  → costruisce il payload Meta SENZA inviarlo e lo
//                     restituisce così l'utente può vederlo prima di pubblicare
//   • dry_run=false → invia il batch reale. Tutti gli oggetti nascono in
//                     status=PAUSED. Se il batch fallisce parziale, fa rollback
//                     (DELETE degli oggetti già creati).
//
// SICUREZZA:
//   • Bearer token utente loggato
//   • Validazione company ownership
//   • Service role per scrivere meta_campaigns / meta_ad_sets / meta_ads
//   • Spend guard check: se daily_budget > campaign_approval_threshold_cents
//     e l'utente non è company_admin → 403 require_approval
//
// PAYLOAD MAPPING (BuilderState frontend → Meta API):
//   campaign.objective       → POST /act_X/campaigns body.objective
//   adSet.daily_budget       → POST /act_X/adsets body.daily_budget (in CENT della currency)
//   adSet.targeting          → POST /act_X/adsets body.targeting (JSON)
//   creative.imagePrompt     → diventa adcreative + object_story_spec.link_data
//                              (image_hash da NEEDS upload pre-batch, vedi NOTA)
//
// NOTA UPLOAD IMMAGINI:
//   In questa versione iniziale supportiamo solo link ads SENZA immagine
//   (Meta usa l'image della Page Facebook). Per il supporto completo serve
//   POST /act_X/adimages PRIMA del batch — verrà aggiunto in iterazione
//   successiva insieme all'integrazione DALL-E.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";

interface CreateCampaignRequest {
  company_id: string;
  ad_account_id: string; // UUID locale (meta_ad_accounts.id)
  builder_state: BuilderState;
  /** Default: true. Se false, pubblica davvero su Meta. */
  dry_run?: boolean;
  /** Se passata, riusa un draft esistente (UPDATE invece di INSERT). */
  draft_id?: string;
}

interface BuilderState {
  name: string;
  objective: string;
  conversionPlace: string;
  offer: string;
  budgetMode: "campaign" | "adset";
  dailyBudget: number; // in EUR (intero)
  zone: string;
  radiusKm: number;
  ageMin: number;
  ageMax: number;
  gender: "all" | "men" | "women";
  languages: string;
  excludedLocations: string;
  interests: string;
  advantageAudience: boolean;
  customAudienceSource?: string;
  lookalikeSource?: string;
  lookalikePercent?: number;
  formIntent: string;
  requiredFields: string;
  qualityQuestion: string;
  privacyUrl: string;
  followUp: string;
  landingUrl: string;
  cta: string;
  imagePrompt: string;
  copyBrief: string;
  copyVariants: string[];
  adSets: BuilderAdSet[];
  creatives: BuilderCreative[];
  targetCpl: number;
  targetOpportunityRate: number;
  testDurationDays: number;
  pauseRule: string;
  scaleRule: string;
  // Targeting Meta avanzato (v2 — multi-luogo, interests reali, placements)
  metaGeoLocations?: Array<{
    key: string;
    name: string;
    type: string;
    country_code?: string;
    radius_km?: number;
    excluded?: boolean;
  }>;
  metaInterestTags?: Array<{ key: string; name: string; type: string }>;
  metaExcludedInterestTags?: Array<{ key: string; name: string; type: string }>;
  metaLocaleTags?: Array<{ key: string; name: string; type: string }>;
  metaPlacements?: {
    automatic: boolean;
    publisher_platforms?: string[];
    facebook_positions?: string[];
    instagram_positions?: string[];
  };
}

interface BuilderAdSet {
  id: string;
  name: string;
  angle: string;
  audienceStrategy: "advantage_plus" | "manual" | "retargeting" | "lookalike";
  zone: string;
  radiusKm: number;
  dailyBudget: number;
  minDailyBudget: number;
  maxDailyBudget: number;
  audience: string;
  excludedAudiences: string;
  ageRange: string;
  gender: "all" | "men" | "women";
  languages: string;
  optimizationEvent: "lead" | "qualified_lead" | "message" | "landing_page_view";
  placementStrategy: string;
}

interface BuilderCreative {
  id: string;
  format: "image" | "video" | "carousel" | "story" | "reel";
  title: string;
  hook: string;
  goal: string;
  prompt: string;
}

interface MetaPayload {
  campaign: Record<string, unknown>;
  ad_sets: Record<string, unknown>[];
  creatives: Record<string, unknown>[];
  ads: Record<string, unknown>[];
}

interface CreateResult {
  success: boolean;
  dry_run: boolean;
  campaign_id?: string;        // UUID locale
  meta_campaign_id?: string;
  meta_ad_set_ids?: string[];
  meta_creative_ids?: string[];
  meta_ad_ids?: string[];
  meta_payload?: MetaPayload;
  errors?: string[];
  rolled_back?: boolean;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    // AUTH
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

    // BODY
    let body: CreateCampaignRequest;
    try {
      body = (await req.json()) as CreateCampaignRequest;
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }
    const dryRun = body.dry_run ?? true; // SAFE DEFAULT

    if (!body.company_id || !body.ad_account_id || !body.builder_state) {
      return json({ error: "missing_required_fields" }, 400, corsHeaders);
    }

    // AUTHZ — solo company_admin o super_admin possono creare campagne live
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
    if (!dryRun && !isSuperAdmin && !isCompanyAdmin) {
      return json({ error: "forbidden_requires_company_admin" }, 403, corsHeaders);
    }

    // LOAD AD ACCOUNT + INTEGRATION
    const { data: adAccount } = await admin
      .from("meta_ad_accounts")
      .select("ad_account_id, integration_id, currency")
      .eq("id", body.ad_account_id)
      .eq("company_id", body.company_id)
      .maybeSingle();
    if (!adAccount) return json({ error: "ad_account_not_found" }, 404, corsHeaders);

    // SPEND GUARD CHECK
    if (!dryRun) {
      const guardCheck = await checkSpendGuard(admin, body.company_id, body.ad_account_id, body.builder_state, isSuperAdmin);
      if (!guardCheck.allowed) {
        return json({
          error: "spend_guard_blocked",
          detail: guardCheck.reason,
        }, 403, corsHeaders);
      }
    }

    // BUILD META PAYLOAD
    const metaPayload = buildMetaPayload(body.builder_state, adAccount.ad_account_id);

    // DRY RUN — restituisce solo il payload
    if (dryRun) {
      const result: CreateResult = {
        success: true,
        dry_run: true,
        meta_payload: metaPayload,
      };
      return json(result, 200, corsHeaders);
    }

    // --- ESECUZIONE REALE ---
    const { data: integration } = await admin
      .from("integrations")
      .select("access_token_encrypted, status")
      .eq("id", adAccount.integration_id)
      .eq("company_id", body.company_id)
      .maybeSingle();
    if (!integration?.access_token_encrypted) {
      return json({ error: "integration_token_missing" }, 400, corsHeaders);
    }
    if (integration.status !== "connected") {
      return json({ error: "integration_not_connected" }, 400, corsHeaders);
    }
    const encKey = await getEncryptionKey();
    const accessToken = await decrypt(integration.access_token_encrypted, encKey);

    // Crea campagna locale in stato 'review' prima del batch (per audit)
    const { data: localCampaign, error: localErr } = await admin
      .from("meta_campaigns")
      .insert({
        company_id: body.company_id,
        integration_id: adAccount.integration_id,
        ad_account_id: body.ad_account_id,
        name: body.builder_state.name,
        objective: body.builder_state.objective,
        status: "review",
        budget_mode: body.builder_state.budgetMode,
        daily_budget_cents:
          body.builder_state.budgetMode === "campaign"
            ? body.builder_state.dailyBudget * 100
            : null,
        builder_state: body.builder_state,
        created_by: authUser.id,
      })
      .select("id")
      .single();

    if (localErr || !localCampaign) {
      const msg = String(localErr?.message ?? "");
      if (msg.includes("does not exist") || msg.includes("schema cache")) {
        return json({
          error: "schema_not_applied",
          detail: "Migration 20260522150000 non applicata.",
        }, 503, corsHeaders);
      }
      return json({ error: "local_campaign_insert_failed", detail: msg }, 500, corsHeaders);
    }

    // ESECUZIONE BATCH
    // Per ora facciamo 4 chiamate sequenziali (più semplice del Batch API e
    // ci permette rollback granulare). In iterazione successiva → Batch API.
    const errors: string[] = [];
    const createdMetaIds: { campaign?: string; adSets: string[]; creatives: string[]; ads: string[] } = {
      adSets: [],
      creatives: [],
      ads: [],
    };
    const localIdMap: { adSetLocalIds: string[]; creativeLocalIds: string[]; adLocalIds: string[] } = {
      adSetLocalIds: [],
      creativeLocalIds: [],
      adLocalIds: [],
    };

    try {
      // 1. CREATE CAMPAIGN
      const campaignResp = await metaFetch(
        `https://graph.facebook.com/${apiVersion}/${normalizeActId(adAccount.ad_account_id)}/campaigns`,
        accessToken,
        metaPayload.campaign,
      );
      if (!campaignResp.ok) {
        throw new Error(`campaign_create_failed: ${campaignResp.error}`);
      }
      createdMetaIds.campaign = campaignResp.data.id;

      await admin
        .from("meta_campaigns")
        .update({
          meta_campaign_id: campaignResp.data.id,
          status: "published",
          last_published_at: new Date().toISOString(),
          raw: campaignResp.data,
        })
        .eq("id", localCampaign.id);

      // 2. CREATE AD SETS
      for (let i = 0; i < metaPayload.ad_sets.length; i += 1) {
        const adSetPayload = {
          ...metaPayload.ad_sets[i],
          campaign_id: campaignResp.data.id,
        };
        const r = await metaFetch(
          `https://graph.facebook.com/${apiVersion}/${normalizeActId(adAccount.ad_account_id)}/adsets`,
          accessToken,
          adSetPayload,
        );
        if (!r.ok) {
          errors.push(`adset_${i}_failed:${r.error}`);
          throw new Error(`adset_${i}_failed`);
        }
        createdMetaIds.adSets.push(r.data.id);

        const { data: localAdSet } = await admin
          .from("meta_ad_sets")
          .insert({
            company_id: body.company_id,
            campaign_id: localCampaign.id,
            meta_adset_id: r.data.id,
            name: body.builder_state.adSets[i]?.name ?? `Ad Set ${i + 1}`,
            status: "published",
            daily_budget_cents: body.builder_state.adSets[i]?.dailyBudget * 100,
            targeting: adSetPayload.targeting ?? {},
            raw: r.data,
            last_published_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (localAdSet) localIdMap.adSetLocalIds.push(localAdSet.id);
      }

      // 3. CREATE CREATIVES
      for (let i = 0; i < metaPayload.creatives.length; i += 1) {
        const r = await metaFetch(
          `https://graph.facebook.com/${apiVersion}/${normalizeActId(adAccount.ad_account_id)}/adcreatives`,
          accessToken,
          metaPayload.creatives[i],
        );
        if (!r.ok) {
          errors.push(`creative_${i}_failed:${r.error}`);
          throw new Error(`creative_${i}_failed`);
        }
        createdMetaIds.creatives.push(r.data.id);

        const { data: localCreative } = await admin
          .from("meta_creatives")
          .insert({
            company_id: body.company_id,
            ad_account_id: body.ad_account_id,
            meta_creative_id: r.data.id,
            name: body.builder_state.creatives[i]?.title ?? `Creative ${i + 1}`,
            format: body.builder_state.creatives[i]?.format ?? "image",
            title: body.builder_state.creatives[i]?.title ?? null,
            body: body.builder_state.copyVariants[i] ?? body.builder_state.copyVariants[0] ?? null,
            ai_prompt: body.builder_state.creatives[i]?.prompt ?? null,
            object_story_spec: metaPayload.creatives[i].object_story_spec,
            raw: r.data,
            last_published_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (localCreative) localIdMap.creativeLocalIds.push(localCreative.id);
      }

      // 4. CREATE ADS (1 ad per adset × creative — semplificato a 1×1 per ora)
      const pairCount = Math.min(localIdMap.adSetLocalIds.length, localIdMap.creativeLocalIds.length);
      for (let i = 0; i < pairCount; i += 1) {
        const adPayload = {
          name: `${body.builder_state.name} — Ad ${i + 1}`,
          adset_id: createdMetaIds.adSets[i],
          creative: { creative_id: createdMetaIds.creatives[i] },
          status: "PAUSED",
        };
        const r = await metaFetch(
          `https://graph.facebook.com/${apiVersion}/${normalizeActId(adAccount.ad_account_id)}/ads`,
          accessToken,
          adPayload,
        );
        if (!r.ok) {
          errors.push(`ad_${i}_failed:${r.error}`);
          throw new Error(`ad_${i}_failed`);
        }
        createdMetaIds.ads.push(r.data.id);

        const { data: localAd } = await admin
          .from("meta_ads")
          .insert({
            company_id: body.company_id,
            adset_id: localIdMap.adSetLocalIds[i],
            creative_id: localIdMap.creativeLocalIds[i],
            meta_ad_id: r.data.id,
            name: adPayload.name,
            status: "paused",
            raw: r.data,
            last_published_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (localAd) localIdMap.adLocalIds.push(localAd.id);
      }

      // SUCCESS
      const result: CreateResult = {
        success: true,
        dry_run: false,
        campaign_id: localCampaign.id,
        meta_campaign_id: createdMetaIds.campaign,
        meta_ad_set_ids: createdMetaIds.adSets,
        meta_creative_ids: createdMetaIds.creatives,
        meta_ad_ids: createdMetaIds.ads,
        meta_payload: metaPayload,
        errors,
      };
      return json(result, 200, corsHeaders);
    } catch (e) {
      // ROLLBACK — DELETE oggetti già creati
      console.error("[meta-ads-create-campaign] batch failed, rolling back", e);
      const rollbackResults = await rollbackMetaObjects(accessToken, createdMetaIds);

      // Marca campagna locale come error
      await admin
        .from("meta_campaigns")
        .update({
          status: "error",
          publish_error: String(e),
        })
        .eq("id", localCampaign.id);

      return json({
        success: false,
        dry_run: false,
        campaign_id: localCampaign.id,
        errors: [...errors, String(e)],
        rolled_back: true,
        rollback_detail: rollbackResults,
      }, 200, corsHeaders);
    }
  } catch (e) {
    console.error("[meta-ads-create-campaign] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

/* ----------------------- Spend Guard ----------------------- */

async function checkSpendGuard(
  // deno-lint-ignore no-explicit-any
  admin: any,
  companyId: string,
  adAccountId: string,
  state: BuilderState,
  isSuperAdmin: boolean,
): Promise<{ allowed: boolean; reason?: string }> {
  // Trova guard (per ad_account o globale)
  const { data: guards } = await admin
    .from("ad_spend_guard")
    .select("*")
    .eq("company_id", companyId)
    .or(`ad_account_id.eq.${adAccountId},ad_account_id.is.null`);
  const guard = (guards ?? []).find((g: { ad_account_id: string | null }) => g.ad_account_id === adAccountId)
    ?? (guards ?? []).find((g: { ad_account_id: string | null }) => g.ad_account_id === null);

  if (!guard || !guard.is_active) return { allowed: true };

  const dailyBudgetCents = state.dailyBudget * 100;
  const totalAdSetBudgetCents = state.adSets.reduce(
    (sum, a) => sum + (a.dailyBudget || 0) * 100,
    0,
  );
  const effectiveBudget = state.budgetMode === "campaign" ? dailyBudgetCents : totalAdSetBudgetCents;

  if (effectiveBudget > guard.campaign_approval_threshold_cents && !isSuperAdmin) {
    return {
      allowed: false,
      reason: `Budget ${(effectiveBudget / 100).toFixed(0)}€/g sopra soglia approvazione ${(guard.campaign_approval_threshold_cents / 100).toFixed(0)}€/g. Serve super_admin.`,
    };
  }
  if (effectiveBudget > guard.daily_cap_cents) {
    return {
      allowed: false,
      reason: `Budget giornaliero ${(effectiveBudget / 100).toFixed(0)}€/g supera il cap (${(guard.daily_cap_cents / 100).toFixed(0)}€/g).`,
    };
  }
  return { allowed: true };
}

/* ----------------------- Meta API helpers ----------------------- */

async function metaFetch(
  url: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: { id: string; [k: string]: unknown }; error?: string }> {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, access_token: accessToken }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      return { ok: false, error: text.substring(0, 500) };
    }
    const data = JSON.parse(text);
    if (!data.id) {
      return { ok: false, error: "no_id_returned" };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function rollbackMetaObjects(
  accessToken: string,
  ids: { campaign?: string; adSets: string[]; creatives: string[]; ads: string[] },
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  const all = [
    ...ids.ads.map((id) => ({ kind: "ad", id })),
    ...ids.creatives.map((id) => ({ kind: "creative", id })),
    ...ids.adSets.map((id) => ({ kind: "adset", id })),
    ...(ids.campaign ? [{ kind: "campaign", id: ids.campaign }] : []),
  ];
  for (const o of all) {
    try {
      const r = await fetch(`https://graph.facebook.com/${apiVersion}/${o.id}?access_token=${accessToken}`, {
        method: "DELETE",
      });
      if (r.ok) deleted += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { deleted, failed };
}

function normalizeActId(adAccountId: string): string {
  return adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
}

/* ----------------------- Builder → Meta Payload ----------------------- */

/**
 * Costruisce il payload Meta API a partire dal BuilderState frontend.
 *
 * REGOLE:
 *   • Tutti gli oggetti nascono in status=PAUSED (mai ACTIVE diretto)
 *   • Budget Meta è in CENTESIMI della currency dell'account
 *   • Targeting segue lo schema Meta esatto (geo_locations, age_min/max, etc.)
 *   • Special_ad_categories vuoto di default (specificare se housing/employment/credit)
 */
function buildMetaPayload(state: BuilderState, _adAccountId: string): MetaPayload {
  // CAMPAIGN
  const campaign: Record<string, unknown> = {
    name: state.name,
    objective: state.objective,
    status: "PAUSED",
    buying_type: "AUCTION",
    special_ad_categories: [],
  };
  if (state.budgetMode === "campaign") {
    campaign.daily_budget = state.dailyBudget * 100;
  }

  // AD SETS
  const ad_sets: Record<string, unknown>[] = state.adSets.map((adSet) => {
    const ageMatch = adSet.ageRange.match(/(\d+)\s*-\s*(\d+)/);
    const ageMin = ageMatch ? parseInt(ageMatch[1], 10) : state.ageMin;
    const ageMax = ageMatch ? parseInt(ageMatch[2], 10) : state.ageMax;

    const genderArr =
      adSet.gender === "men" ? [1] : adSet.gender === "women" ? [2] : undefined;

    const optimizationGoal =
      adSet.optimizationEvent === "lead" || adSet.optimizationEvent === "qualified_lead"
        ? "LEAD_GENERATION"
        : adSet.optimizationEvent === "message"
        ? "CONVERSATIONS"
        : "LANDING_PAGE_VIEWS";

    // ════════════════════════════════════════════════════════════════
    // GEO LOCATIONS — v2 (multi-luogo via state.metaGeoLocations)
    //   con fallback v1 (custom_locations.address_string) per bozze legacy.
    // ════════════════════════════════════════════════════════════════
    const geoIncluded: { countries: string[]; regions: { key: string }[]; cities: { key: string; radius?: number; distance_unit?: string }[]; custom_locations: Record<string, unknown>[] } = {
      countries: [],
      regions: [],
      cities: [],
      custom_locations: [],
    };
    const geoExcluded: { countries: string[]; regions: { key: string }[]; cities: { key: string }[] } = {
      countries: [],
      regions: [],
      cities: [],
    };

    const v2Locations = state.metaGeoLocations ?? [];
    if (v2Locations.length > 0) {
      for (const loc of v2Locations) {
        const bucket = loc.excluded ? geoExcluded : geoIncluded;
        if (loc.type === "country" && loc.country_code) {
          bucket.countries.push(loc.country_code);
        } else if (loc.type === "region") {
          bucket.regions.push({ key: loc.key });
        } else if (loc.type === "city") {
          if (loc.excluded) {
            geoExcluded.cities.push({ key: loc.key });
          } else {
            geoIncluded.cities.push({
              key: loc.key,
              radius: loc.radius_km ?? 25,
              distance_unit: "kilometer",
            });
          }
        }
      }
    } else {
      // Fallback v1 — usa zone + radiusKm dell'adSet
      geoIncluded.custom_locations.push({
        address_string: adSet.zone,
        radius: adSet.radiusKm,
        distance_unit: "kilometer",
      });
    }

    const geoLocationsPayload: Record<string, unknown> = {};
    if (geoIncluded.countries.length > 0) geoLocationsPayload.countries = geoIncluded.countries;
    if (geoIncluded.regions.length > 0) geoLocationsPayload.regions = geoIncluded.regions;
    if (geoIncluded.cities.length > 0) geoLocationsPayload.cities = geoIncluded.cities;
    if (geoIncluded.custom_locations.length > 0) geoLocationsPayload.custom_locations = geoIncluded.custom_locations;

    const excludedGeoPayload: Record<string, unknown> = {};
    if (geoExcluded.countries.length > 0) excludedGeoPayload.countries = geoExcluded.countries;
    if (geoExcluded.regions.length > 0) excludedGeoPayload.regions = geoExcluded.regions;
    if (geoExcluded.cities.length > 0) excludedGeoPayload.cities = geoExcluded.cities;

    // ════════════════════════════════════════════════════════════════
    // LOCALES — v2 (state.metaLocaleTags) con fallback v1 (adSet.languages stringa)
    // ════════════════════════════════════════════════════════════════
    const localesPayload: number[] = state.metaLocaleTags?.length
      ? state.metaLocaleTags.map((l) => Number(l.key)).filter((n) => !Number.isNaN(n))
      : parseLocales(adSet.languages);

    // ════════════════════════════════════════════════════════════════
    // FLEXIBLE_SPEC — interests v2 (state.metaInterestTags + exclusions)
    // ════════════════════════════════════════════════════════════════
    const flexibleSpec: Array<Record<string, unknown>> = [];
    if (state.metaInterestTags && state.metaInterestTags.length > 0) {
      flexibleSpec.push({
        interests: state.metaInterestTags.map((t) => ({ id: t.key, name: t.name })),
      });
    }

    const exclusions: Record<string, unknown> = {};
    if (state.metaExcludedInterestTags && state.metaExcludedInterestTags.length > 0) {
      exclusions.interests = state.metaExcludedInterestTags.map((t) => ({ id: t.key, name: t.name }));
    }

    const targeting: Record<string, unknown> = {
      age_min: ageMin,
      age_max: ageMax,
      geo_locations: geoLocationsPayload,
      locales: localesPayload,
      targeting_automation: {
        advantage_audience: state.advantageAudience ? 1 : 0,
      },
    };
    if (Object.keys(excludedGeoPayload).length > 0) targeting.excluded_geo_locations = excludedGeoPayload;
    if (flexibleSpec.length > 0) targeting.flexible_spec = flexibleSpec;
    if (Object.keys(exclusions).length > 0) targeting.exclusions = exclusions;
    if (genderArr) targeting.genders = genderArr;

    // ════════════════════════════════════════════════════════════════
    // PLACEMENTS — manuali vs automatic (Advantage placements)
    // ════════════════════════════════════════════════════════════════
    const placementsConfig = state.metaPlacements;
    if (placementsConfig && !placementsConfig.automatic) {
      if (placementsConfig.publisher_platforms && placementsConfig.publisher_platforms.length > 0) {
        targeting.publisher_platforms = placementsConfig.publisher_platforms;
      }
      if (placementsConfig.facebook_positions && placementsConfig.facebook_positions.length > 0) {
        targeting.facebook_positions = placementsConfig.facebook_positions;
      }
      if (placementsConfig.instagram_positions && placementsConfig.instagram_positions.length > 0) {
        targeting.instagram_positions = placementsConfig.instagram_positions;
      }
    }

    return {
      name: adSet.name,
      status: "PAUSED",
      daily_budget: adSet.dailyBudget * 100,
      optimization_goal: optimizationGoal,
      billing_event: "IMPRESSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting,
    };
  });

  // CREATIVES
  const creatives: Record<string, unknown>[] = state.creatives.map((creative, i) => {
    const copy = state.copyVariants[i] ?? state.copyVariants[0] ?? state.offer;
    return {
      name: creative.title,
      object_story_spec: {
        // page_id: VA RIEMPITO QUANDO L'UTENTE SCEGLIE LA PAGE NEL WIZARD
        // Per ora resta null e Meta darà errore: questo verrà settato dal client.
        link_data: {
          message: copy,
          link: state.landingUrl || "https://www.facebook.com",
          call_to_action: { type: state.cta || "GET_QUOTE" },
        },
      },
      // adcreative status non si setta in creazione, eredita da ad parent
    };
  });

  // ADS (1 ad per coppia adset×creative)
  const ads: Record<string, unknown>[] = [];
  const pairCount = Math.min(state.adSets.length, state.creatives.length);
  for (let i = 0; i < pairCount; i += 1) {
    ads.push({
      name: `${state.name} — Ad ${i + 1}`,
      status: "PAUSED",
      // adset_id e creative.creative_id verranno popolati durante l'esecuzione
    });
  }

  return { campaign, ad_sets, creatives, ads };
}

function parseLocales(languages: string): number[] {
  // Meta usa locale ID numerici. Mappa minima — espandibile in iterazione.
  const map: Record<string, number> = {
    italiano: 24,
    "italian": 24,
    italy: 24,
    inglese: 6,
    english: 6,
    francese: 7,
    french: 7,
    tedesco: 5,
    german: 5,
    spagnolo: 23,
    spanish: 23,
  };
  const tokens = languages
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean);
  const locales = tokens.map((t) => map[t]).filter((n): n is number => typeof n === "number");
  return locales.length > 0 ? locales : [24]; // default italiano
}

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
