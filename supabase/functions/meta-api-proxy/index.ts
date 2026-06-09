import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, company_id, integration_id, page_asset_id, form_id } = body;

    if (!company_id || !integration_id) {
      return new Response(JSON.stringify({ error: "company_id and integration_id required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // SEC FIX — SEC-CRITICAL: valida che l'utente autenticato appartenga
    // effettivamente a company_id richiesto. Prima il body.company_id era
    // user-controlled e permetteva cross-tenant read dei token Meta.
    // Accetta super_admin come bypass (cross-company per supporto).
    const [profileRes, rolesRes] = await Promise.all([
      adminClient
        .from("profiles")
        .select("company_id")
        .eq("id", authUser.id)
        .maybeSingle(),
      adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", authUser.id),
    ]);
    const userCompanyId = profileRes.data?.company_id ?? null;
    const isSuperAdmin = (rolesRes.data ?? []).some((r) => r.role === "super_admin");
    if (!isSuperAdmin && userCompanyId !== company_id) {
      console.error(
        `meta-api-proxy: tenant mismatch — user=${authUser.id} profile.company=${userCompanyId} requested=${company_id}`,
      );
      return new Response(
        JSON.stringify({ error: "Forbidden — tenant mismatch" }),
        {
          status: 403,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    // Verifica anche che integration_id appartenga a questa company (prevenire
    // escalation: utente conosce integration_id di altra company).
    const { data: integRow } = await adminClient
      .from("integrations")
      .select("id, company_id, provider")
      .eq("id", integration_id)
      .maybeSingle();
    if (!integRow || (integRow.company_id !== company_id && !isSuperAdmin)) {
      return new Response(
        JSON.stringify({ error: "Integration not found or not owned by company" }),
        {
          status: 404,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    // ────────────────────────────────────────────────────────────
    // RATE LIMITING — Meta Graph API: max 200 chiamate/ora/user
    // Teniamo soglia a 180 per avere margine e evitare 429
    // ────────────────────────────────────────────────────────────
    const META_HOURLY_LIMIT = 180;
    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);
    const hourStartIso = hourStart.toISOString();
    const hourEndIso = new Date(hourStart.getTime() + 3600_000).toISOString();
    try {
      // upsert counter corrente (insert o increment)
      const { data: rateRow } = await adminClient
        .from("meta_api_rate_limit")
        .select("id, call_count, last_429_at")
        .eq("company_id", company_id)
        .eq("window_start", hourStartIso)
        .maybeSingle();

      const currentCount = rateRow?.call_count ?? 0;
      if (currentCount >= META_HOURLY_LIMIT) {
        const retryAfter = Math.ceil((hourStart.getTime() + 3600_000 - Date.now()) / 1000);
        return new Response(
          JSON.stringify({
            error: "Rate limit reached — retry later",
            retry_after_seconds: retryAfter,
            calls_this_hour: currentCount,
            limit: META_HOURLY_LIMIT,
          }),
          {
            status: 429,
            headers: {
              ...getCorsHeaders(req),
              "Content-Type": "application/json",
              "Retry-After": String(retryAfter),
            },
          },
        );
      }
      // Incrementa contatore (best-effort, no bloccante)
      if (rateRow) {
        await adminClient
          .from("meta_api_rate_limit")
          .update({ call_count: currentCount + 1, updated_at: new Date().toISOString() })
          .eq("id", rateRow.id);
      } else {
        await adminClient.from("meta_api_rate_limit").insert({
          company_id,
          integration_id,
          window_start: hourStartIso,
          window_end: hourEndIso,
          call_count: 1,
        });
      }
    } catch (rateErr) {
      // Non bloccare la request se il rate limit check fallisce (fail-open)
      console.warn("Rate limit check failed (fail-open):", (rateErr as Error).message);
    }

    // Get access token and page tokens
    const { data: creds } = await adminClient
      .from("integration_credentials")
      .select("access_token_encrypted, meta_user_id, meta_page_tokens")
      .eq("integration_id", integration_id)
      .single();

    if (!creds) {
      return new Response(JSON.stringify({ error: "No credentials found" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const encKey = getEncryptionKey();
    const accessToken = await decrypt(creds.access_token_encrypted, encKey);

    let result: any;

    switch (action) {
      case "get-assets": {
        const pagesRes = await fetchWithRetry(
          `https://graph.facebook.com/${apiVersion}/me/accounts?fields=id,name,instagram_business_account{id,name,username}&limit=100&access_token=${accessToken}`
        );
        const pagesData = await pagesRes.json();
        
        const { data: dbAssets } = await adminClient
          .from("meta_assets")
          .select("*")
          .eq("integration_id", integration_id)
          .eq("company_id", company_id);

        result = {
          pages: pagesData.data || [],
          db_assets: dbAssets || [],
        };
        break;
      }

      case "get-forms": {
        if (!page_asset_id) {
          return new Response(JSON.stringify({ error: "page_asset_id required" }), {
            status: 400,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const { data: pageAsset } = await adminClient
          .from("meta_assets")
          .select("*")
          .eq("id", page_asset_id)
          .eq("company_id", company_id)
          .eq("integration_id", integration_id)
          .single();

        if (!pageAsset) {
          return new Response(JSON.stringify({ error: "Page asset not found" }), {
            status: 404,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        // Get page access token from credentials (secure storage), not from meta_assets
        const pageTokens = (creds as any).meta_page_tokens || {};
        const pageAccessToken = pageTokens[pageAsset.asset_id]
          ? await decrypt(pageTokens[pageAsset.asset_id], encKey)
          : accessToken;

        const formsRes = await fetchWithRetry(
          `https://graph.facebook.com/${apiVersion}/${pageAsset.asset_id}/leadgen_forms?fields=id,name,status,questions&access_token=${pageAccessToken}`
        );
        const formsData = await formsRes.json();

        const { data: dbForms } = await adminClient
          .from("meta_lead_forms")
          .select("*")
          .eq("integration_id", integration_id)
          .eq("company_id", company_id);

        result = {
          forms: formsData.data || [],
          db_forms: dbForms || [],
        };
        break;
      }

      case "get-form-fields": {
        if (!form_id) {
          return new Response(JSON.stringify({ error: "form_id required" }), {
            status: 400,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const formRes = await fetchWithRetry(
          `https://graph.facebook.com/${apiVersion}/${form_id}?fields=id,name,questions,status&access_token=${accessToken}`
        );
        const formData = await formRes.json();

        result = { form: formData };
        break;
      }

      case "get-lead": {
        const { lead_id } = body;
        if (!lead_id) {
          return new Response(JSON.stringify({ error: "lead_id required" }), {
            status: 400,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const leadRes = await fetchWithRetry(
          `https://graph.facebook.com/${apiVersion}/${lead_id}?fields=id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id&access_token=${accessToken}`
        );
        const leadData = await leadRes.json();

        result = { lead: leadData };
        break;
      }

      case "backfill-leads": {
        const { form_id: bfFormId, mode, since_date } = body;
        if (!bfFormId) {
          return new Response(JSON.stringify({ error: "form_id required" }), {
            status: 400,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        // Find the page asset that owns this form to get the correct page token
        const { data: formRecord } = await adminClient
          .from("meta_lead_forms")
          .select("page_asset_id")
          .eq("form_id", bfFormId)
          .eq("company_id", company_id)
          .eq("integration_id", integration_id)
          .single();

        const pageTokens = (creds as any).meta_page_tokens || {};
        let bfToken = accessToken;
        if (formRecord?.page_asset_id) {
          const { data: pageAsset } = await adminClient
            .from("meta_assets")
            .select("asset_id")
            .eq("id", formRecord.page_asset_id)
            .eq("company_id", company_id)
            .eq("integration_id", integration_id)
            .single();
          if (pageAsset && pageTokens[pageAsset.asset_id]) {
            bfToken = await decrypt(pageTokens[pageAsset.asset_id], encKey);
          }
        }

        let url = `https://graph.facebook.com/${apiVersion}/${bfFormId}/leads?fields=id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name&limit=50&access_token=${bfToken}`;
        if (mode === "since_date" && since_date) {
          const sinceTs = Math.floor(new Date(since_date).getTime() / 1000);
          url += `&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":${sinceTs}}]`;
        }

        let imported = 0;
        let nextUrl: string | null = url;

        while (nextUrl) {
          const res = await fetchWithRetry(nextUrl);
          const data = await res.json();
          const leads = data.data || [];

          for (const lead of leads) {
            await adminClient
              .from("integration_webhook_events")
              .upsert({
                company_id,
                integration_id,
                provider: "meta",
                event_type: "leadgen",
                event_id: lead.id,
                payload: lead,
                received_at: new Date().toISOString(),
                status: "pending",
                fail_count: 0,
              }, { onConflict: "company_id,provider,event_id" });
            imported++;
          }

          nextUrl = data.paging?.next || null;
        }

        await adminClient.from("integration_audit_log").insert({
          company_id,
          actor_user_id: authUser.id,
          action: "backfill_started",
          entity_type: "form",
          entity_id: bfFormId,
          metadata: { mode, since_date, imported },
        });

        result = { imported };
        break;
      }

      case "disconnect": {
        try {
          await fetch(`https://graph.facebook.com/${apiVersion}/me/permissions?access_token=${accessToken}`, {
            method: "DELETE",
          });
        } catch (e) {
          console.warn("Token revocation failed (may already be expired):", e);
        }

        await adminClient
          .from("integrations")
          .update({
            status: "disconnected",
            health: "ok",
            last_error_code: null,
            last_error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration_id);

        await adminClient
          .from("integration_credentials")
          .delete()
          .eq("integration_id", integration_id);

        await adminClient
          .from("meta_lead_forms")
          .update({ status: "inactive" })
          .eq("integration_id", integration_id)
          .eq("company_id", company_id);

        await adminClient.from("integration_audit_log").insert({
          company_id,
          actor_user_id: authUser.id,
          action: "integration_disconnected",
          entity_type: "integration",
          entity_id: integration_id,
          metadata: { provider: "meta" },
        });

        result = { success: true };
        break;
      }

      case "get-ad-accounts": {
        const accountsRes = await fetchWithRetry(
          `https://graph.facebook.com/${apiVersion}/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${accessToken}`
        );
        const accountsData = await accountsRes.json();
        const accounts = accountsData.data || [];

        // Upsert into meta_ad_accounts
        for (const acc of accounts) {
          await adminClient.from("meta_ad_accounts").upsert({
            company_id,
            integration_id,
            ad_account_id: acc.id,
            ad_account_name: acc.name || acc.id,
            account_status: acc.account_status || 0,
            currency: acc.currency || "EUR",
            updated_at: new Date().toISOString(),
          }, { onConflict: "company_id,ad_account_id" });
        }

        result = { accounts };
        break;
      }

      case "get-campaign-insights": {
        const { ad_account_id, date_start, date_end, level: insightLevel, time_increment } = body;
        if (!ad_account_id) {
          return new Response(JSON.stringify({ error: "ad_account_id required" }), {
            status: 400,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const lvl = insightLevel || "campaign";
        const increment = time_increment || "all_days";

        // Check cache (only for non-daily breakdown)
        if (increment === "all_days") {
          const { data: cached } = await adminClient
            .from("meta_insights_cache")
            .select("*")
            .eq("company_id", company_id)
            .eq("ad_account_id", ad_account_id)
            .eq("date_start", date_start)
            .eq("date_end", date_end)
            .eq("level", lvl)
            .gte("expires_at", new Date().toISOString())
            .maybeSingle();

          if (cached) {
            result = { insights: cached.payload_json, from_cache: true };
            break;
          }
        }

        const fields = "campaign_name,campaign_id,adset_name,adset_id,ad_name,ad_id,impressions,clicks,spend,ctr,cpc,cpm,frequency,actions,action_values,objective,reach";
        let insightsUrl = `https://graph.facebook.com/${apiVersion}/${ad_account_id}/insights?fields=${fields}&time_range={"since":"${date_start}","until":"${date_end}"}&level=${lvl}&limit=500&access_token=${accessToken}`;
        if (increment === "1") {
          insightsUrl += `&time_increment=1`;
        }

        const allInsights: any[] = [];
        let nextUrl: string | null = insightsUrl;
        while (nextUrl) {
          const insRes = await fetchWithRetry(nextUrl);
          const insData = await insRes.json();
          if (insData.error) {
            throw new Error(insData.error.message || JSON.stringify(insData.error));
          }
          allInsights.push(...(insData.data || []));
          nextUrl = insData.paging?.next || null;
        }

        // Cache the result (only aggregate, not daily)
        if (increment === "all_days" && allInsights.length > 0) {
          await adminClient.from("meta_insights_cache").upsert({
            company_id,
            ad_account_id,
            date_start,
            date_end,
            level: lvl,
            payload_json: allInsights,
            fetched_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          }, { onConflict: "company_id,ad_account_id,date_start,date_end,level" });
        }

        result = { insights: allInsights, from_cache: false };
        break;
      }

      case "get-campaign-status": {
        const { ad_account_id: statusAccId } = body;
        if (!statusAccId) {
          return new Response(JSON.stringify({ error: "ad_account_id required" }), {
            status: 400,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const statusRes = await fetchWithRetry(
          `https://graph.facebook.com/${apiVersion}/${statusAccId}/campaigns?fields=id,name,status,objective&limit=500&access_token=${accessToken}`
        );
        const statusData = await statusRes.json();

        result = { campaigns: statusData.data || [] };
        break;
      }

      case "send-test-lead": {
        // Inietta un lead simulato nella coda per testare il flusso end-to-end
        // senza bisogno di una campagna Meta attiva
        const { form_id: testFormId, test_data } = body;
        if (!testFormId) {
          return new Response(JSON.stringify({ error: "form_id required" }), {
            status: 400,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const testLeadId = `test_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        const defaultTestData = {
          full_name: "Mario Rossi",
          email: "mario.test@example.com",
          phone_number: "+39 333 1234567",
          city: "Milano",
          ...((test_data as Record<string, string>) || {}),
        };

        const { error: insertErr } = await adminClient
          .from("integration_webhook_events")
          .insert({
            company_id,
            integration_id,
            provider: "meta",
            event_type: "leadgen",
            event_id: testLeadId,
            payload: {
              leadgen_id: testLeadId,
              form_id: testFormId,
              page_id: null,
              created_time: Math.floor(Date.now() / 1000),
              is_test: true,
              // Simula field_data come se venisse da Meta
              _test_field_data: Object.entries(defaultTestData).map(([name, value]) => ({
                name,
                values: [value],
              })),
            },
            status: "pending",
            received_at: new Date().toISOString(),
          });

        if (insertErr) throw new Error(`Test lead insert failed: ${insertErr.message}`);

        await adminClient.from("integration_audit_log").insert({
          company_id,
          action: "test_lead_sent",
          entity_type: "integration",
          entity_id: integration_id,
          metadata: { test_lead_id: testLeadId, form_id: testFormId, test_data: defaultTestData },
        });

        result = { success: true, test_lead_id: testLeadId, queued: true };
        break;
      }

      case "subscribe-webhook": {
        if (!page_asset_id) {
          return new Response(JSON.stringify({ error: "page_asset_id required" }), {
            status: 400,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const { data: pageAsset } = await adminClient
          .from("meta_assets")
          .select("asset_id")
          .eq("id", page_asset_id)
          .eq("company_id", company_id)
          .eq("integration_id", integration_id)
          .single();
        if (!pageAsset) {
          return new Response(JSON.stringify({ error: "Page asset not found" }), {
            status: 404,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const fbPageId = pageAsset.asset_id;
        const pageTokens = (creds as any).meta_page_tokens as Record<string, string> | null;
        if (!pageTokens?.[fbPageId]) {
          return new Response(JSON.stringify({ error: "Page token not found. Riconnetti Meta." }), {
            status: 400,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const pageToken = await decrypt(pageTokens[fbPageId], encKey);

        const subRes = await fetch(
          `https://graph.facebook.com/${apiVersion}/${fbPageId}/subscribed_apps`,
          {
            method: "POST",
            body: new URLSearchParams({ subscribed_fields: "leadgen", access_token: pageToken }),
          }
        );
        const subData = await subRes.json();
        if (subData.error) throw new Error(`Meta subscription error: ${subData.error.message}`);

        await adminClient.from("integration_webhook_subscriptions").upsert(
          {
            company_id,
            integration_id,
            page_id: fbPageId,
            subscribed_fields: ["leadgen"],
            status: "active",
            subscribed_at: new Date().toISOString(),
          },
          { onConflict: "integration_id,page_id" }
        );

        await adminClient.from("integration_audit_log").insert({
          company_id,
          action: "webhook_subscribed",
          entity_type: "integration",
          entity_id: integration_id,
          metadata: { page_id: fbPageId, subscribed_fields: ["leadgen"] },
        });

        result = { success: true, page_id: fbPageId };
        break;
      }

      // ── Diagnostica permessi: /me/permissions (granted vs declined) ──
      case "get-permissions": {
        const permRes = await fetchWithRetry(
          `https://graph.facebook.com/${apiVersion}/me/permissions?access_token=${accessToken}`,
        );
        const permData = await permRes.json();
        if (!permRes.ok) {
          return new Response(
            JSON.stringify({ error: permData.error?.message || "Errore lettura permessi", meta_error: permData.error ?? null }),
            { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
          );
        }
        const granted = (permData.data || []).filter((p: any) => p.status === "granted").map((p: any) => p.permission);
        const declined = (permData.data || []).filter((p: any) => p.status === "declined").map((p: any) => p.permission);
        result = { meta_user_id: creds.meta_user_id, granted, declined };
        break;
      }

      // ── pages_read_engagement — post recenti della Pagina con engagement ──
      // Esercita il permesso pages_read_engagement (App Review) e alimenta il
      // pannello "Social". Accetta page_asset_id (risolto a page id) o page_id.
      case "get-page-posts": {
        let pageId: string | undefined = body.page_id;
        let assetIdForToken: string | undefined = pageId;
        if (page_asset_id) {
          const { data: pageAsset } = await adminClient
            .from("meta_assets")
            .select("asset_id")
            .eq("id", page_asset_id)
            .eq("company_id", company_id)
            .eq("integration_id", integration_id)
            .single();
          if (!pageAsset) {
            return new Response(JSON.stringify({ error: "Page asset not found" }), {
              status: 404,
              headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
            });
          }
          pageId = pageAsset.asset_id;
          assetIdForToken = pageAsset.asset_id;
        }
        if (!pageId) {
          return new Response(JSON.stringify({ error: "page_asset_id o page_id richiesto" }), {
            status: 400,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const pageTokens = (creds as any).meta_page_tokens || {};
        const pageAccessToken = assetIdForToken && pageTokens[assetIdForToken]
          ? await decrypt(pageTokens[assetIdForToken], encKey)
          : accessToken;

        const fields =
          "id,message,story,created_time,permalink_url,full_picture," +
          "reactions.summary(true).limit(0),comments.summary(true).limit(0),shares";
        const postsRes = await fetchWithRetry(
          `https://graph.facebook.com/${apiVersion}/${pageId}/posts?fields=${encodeURIComponent(fields)}&limit=10&access_token=${pageAccessToken}`,
        );
        const postsData = await postsRes.json();
        if (!postsRes.ok) {
          return new Response(
            JSON.stringify({
              error: postsData.error?.message || "Errore lettura post pagina",
              meta_error: postsData.error ?? null,
            }),
            { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
          );
        }
        const posts = (postsData.data || []).map((p: any) => ({
          id: p.id,
          message: p.message ?? p.story ?? "",
          created_time: p.created_time,
          permalink_url: p.permalink_url ?? null,
          image: p.full_picture ?? null,
          reactions: p.reactions?.summary?.total_count ?? 0,
          comments: p.comments?.summary?.total_count ?? 0,
          shares: p.shares?.count ?? 0,
        }));
        result = { page_id: pageId, posts };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("meta-api-proxy error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.status === 429 || res.status >= 500) {
      const waitMs = Math.pow(2, i) * 1000;
      console.warn(`HTTP ${res.status}, retrying in ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    return res;
  }
  return fetch(url, options);
}
