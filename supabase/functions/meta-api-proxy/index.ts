import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, company_id, integration_id, page_asset_id, form_id } = body;

    if (!company_id || !integration_id) {
      return new Response(JSON.stringify({ error: "company_id and integration_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get access token and page tokens
    const { data: creds } = await adminClient
      .from("integration_credentials")
      .select("access_token_encrypted, meta_user_id, meta_page_tokens")
      .eq("integration_id", integration_id)
      .single();

    if (!creds) {
      return new Response(JSON.stringify({ error: "No credentials found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const encKey = getEncryptionKey();
    const accessToken = await decrypt(creds.access_token_encrypted, encKey);

    let result: any;

    switch (action) {
      case "get-assets": {
        const pagesRes = await fetchWithRetry(
          `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,name,username}&limit=100&access_token=${accessToken}`
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
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: pageAsset } = await adminClient
          .from("meta_assets")
          .select("*")
          .eq("id", page_asset_id)
          .single();

        if (!pageAsset) {
          return new Response(JSON.stringify({ error: "Page asset not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get page access token from credentials (secure storage), not from meta_assets
        const pageTokens = (creds as any).meta_page_tokens || {};
        const pageAccessToken = pageTokens[pageAsset.asset_id]
          ? await decrypt(pageTokens[pageAsset.asset_id], encKey)
          : accessToken;

        const formsRes = await fetchWithRetry(
          `https://graph.facebook.com/v21.0/${pageAsset.asset_id}/leadgen_forms?fields=id,name,status,questions&access_token=${pageAccessToken}`
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
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const formRes = await fetchWithRetry(
          `https://graph.facebook.com/v21.0/${form_id}?fields=id,name,questions,status&access_token=${accessToken}`
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
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const leadRes = await fetchWithRetry(
          `https://graph.facebook.com/v21.0/${lead_id}?fields=id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id&access_token=${accessToken}`
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
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Find the page asset that owns this form to get the correct page token
        const { data: formRecord } = await adminClient
          .from("meta_lead_forms")
          .select("page_id")
          .eq("form_id", bfFormId)
          .eq("integration_id", integration_id)
          .single();

        const pageTokens = (creds as any).meta_page_tokens || {};
        let bfToken = accessToken;
        if (formRecord?.page_id) {
          const { data: pageAsset } = await adminClient
            .from("meta_assets")
            .select("asset_id")
            .eq("id", formRecord.page_id)
            .single();
          if (pageAsset && pageTokens[pageAsset.asset_id]) {
            bfToken = await decrypt(pageTokens[pageAsset.asset_id], encKey);
          }
        }

        let url = `https://graph.facebook.com/v21.0/${bfFormId}/leads?fields=id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name&limit=50&access_token=${bfToken}`;
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
              }, { onConflict: "company_id,event_id" });
            imported++;
          }

          nextUrl = data.paging?.next || null;
        }

        await adminClient.from("integration_audit_log").insert({
          company_id,
          actor_user_id: claimsData.claims.sub,
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
          await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${accessToken}`, {
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
          .eq("integration_id", integration_id);

        await adminClient.from("integration_audit_log").insert({
          company_id,
          actor_user_id: claimsData.claims.sub,
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
          `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${accessToken}`
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
            headers: { ...corsHeaders, "Content-Type": "application/json" },
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

        const fields = "campaign_name,campaign_id,adset_name,adset_id,ad_name,ad_id,impressions,clicks,spend,ctr,cpc,actions,action_values,objective,reach";
        let insightsUrl = `https://graph.facebook.com/v21.0/${ad_account_id}/insights?fields=${fields}&time_range={"since":"${date_start}","until":"${date_end}"}&level=${lvl}&limit=500&access_token=${accessToken}`;
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
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const statusRes = await fetchWithRetry(
          `https://graph.facebook.com/v21.0/${statusAccId}/campaigns?fields=id,name,status,objective&limit=500&access_token=${accessToken}`
        );
        const statusData = await statusRes.json();

        result = { campaigns: statusData.data || [] };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("meta-api-proxy error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
