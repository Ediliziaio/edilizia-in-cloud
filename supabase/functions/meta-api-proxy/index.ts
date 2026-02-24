import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Get access token
    const { data: creds } = await adminClient
      .from("integration_credentials")
      .select("access_token_encrypted, meta_user_id")
      .eq("integration_id", integration_id)
      .single();

    if (!creds) {
      return new Response(JSON.stringify({ error: "No credentials found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = atob(creds.access_token_encrypted);

    let result: any;

    switch (action) {
      case "get-assets": {
        // Fetch pages from Meta
        const pagesRes = await fetchWithRetry(
          `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,name,username}&limit=100&access_token=${accessToken}`
        );
        const pagesData = await pagesRes.json();
        
        // Also fetch existing assets from DB to get selection state
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

        // Get page asset to find page_id and page access token
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

        const pageAccessToken = pageAsset.metadata?.page_access_token
          ? atob(pageAsset.metadata.page_access_token as string)
          : accessToken;

        const formsRes = await fetchWithRetry(
          `https://graph.facebook.com/v21.0/${pageAsset.asset_id}/leadgen_forms?fields=id,name,status,questions&access_token=${pageAccessToken}`
        );
        const formsData = await formsRes.json();

        // Get existing form configs from DB
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

      case "disconnect": {
        // Revoke token
        try {
          await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${accessToken}`, {
            method: "DELETE",
          });
        } catch (e) {
          console.warn("Token revocation failed (may already be expired):", e);
        }

        // Update integration status
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

        // Delete credentials
        await adminClient
          .from("integration_credentials")
          .delete()
          .eq("integration_id", integration_id);

        // Deactivate all forms
        await adminClient
          .from("meta_lead_forms")
          .update({ status: "inactive" })
          .eq("integration_id", integration_id);

        // Audit
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

// Fetch with retry for Meta API rate limits
async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const waitMs = Math.pow(2, i) * 1000;
      console.warn(`Rate limited, retrying in ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (res.status >= 500) {
      const waitMs = Math.pow(2, i) * 1000;
      console.warn(`Server error ${res.status}, retrying in ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    return res;
  }
  return fetch(url, options); // last attempt
}
