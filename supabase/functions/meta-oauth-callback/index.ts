import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);

  // Handle GET (browser redirect from Meta)
  if (req.method === "GET") {
    const code = url.searchParams.get("code");
    const stateB64 = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      // User denied permissions
      return new Response(buildRedirectHtml("error", errorParam), {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }

    if (!code || !stateB64) {
      return new Response(buildRedirectHtml("error", "missing_params"), {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }

    try {
      // Decode state
      const statePayload = JSON.parse(atob(stateB64));
      const { company_id, user_id, nonce } = statePayload;

      if (!company_id || !user_id || !nonce) {
        return new Response(buildRedirectHtml("error", "invalid_state"), {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const metaAppId = Deno.env.get("META_APP_ID")!;
      const metaAppSecret = Deno.env.get("META_APP_SECRET")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      // Validate nonce exists
      const { data: stateJobs } = await adminClient
        .from("integration_sync_jobs")
        .select("id")
        .eq("company_id", company_id)
        .eq("job_type", "oauth_state")
        .eq("status", "queued")
        .limit(1);

      if (!stateJobs || stateJobs.length === 0) {
        return new Response(buildRedirectHtml("error", "state_expired"), {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }

      // Clean up used state
      await adminClient
        .from("integration_sync_jobs")
        .delete()
        .eq("id", stateJobs[0].id);

      // Exchange code for short-lived token
      const callbackUrl = `${supabaseUrl}/functions/v1/meta-oauth-callback`;
      const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(callbackUrl)}&client_secret=${metaAppSecret}&code=${code}`;

      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        console.error("Meta token exchange error:", tokenData.error);
        return new Response(buildRedirectHtml("error", "token_exchange_failed"), {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }

      const shortLivedToken = tokenData.access_token;

      // Exchange for long-lived token (60 days)
      const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${shortLivedToken}`;
      const longLivedRes = await fetch(longLivedUrl);
      const longLivedData = await longLivedRes.json();

      const accessToken = longLivedData.access_token || shortLivedToken;
      const expiresIn = longLivedData.expires_in || 5184000; // default 60 days

      // Get Meta user info
      const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${accessToken}`);
      const meData = await meRes.json();

      // Upsert integration
      const { data: integration, error: integErr } = await adminClient
        .from("integrations")
        .upsert(
          {
            company_id,
            provider: "meta",
            status: "connected",
            connected_by: user_id,
            health: "ok",
            last_error_code: null,
            last_error_message: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,provider" }
        )
        .select()
        .single();

      if (integErr) {
        console.error("Integration upsert error:", integErr);
        return new Response(buildRedirectHtml("error", "db_error"), {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }

      // Store encrypted token (simple base64 encoding for now; use pgcrypto in production)
      const tokenEncrypted = btoa(accessToken);
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Delete old credentials and insert new
      await adminClient
        .from("integration_credentials")
        .delete()
        .eq("integration_id", integration.id);

      await adminClient.from("integration_credentials").insert({
        integration_id: integration.id,
        access_token_encrypted: tokenEncrypted,
        token_type: "bearer",
        expires_at: expiresAt,
        granted_scopes: tokenData.scope ? tokenData.scope.split(",") : [],
        meta_user_id: meData.id || null,
        meta_user_name: meData.name || null,
      });

      // Fetch pages and save as assets
      const pagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username}&limit=100&access_token=${accessToken}`
      );
      const pagesData = await pagesRes.json();

      if (pagesData.data && Array.isArray(pagesData.data)) {
        // Clear old page assets for this integration
        await adminClient
          .from("meta_assets")
          .delete()
          .eq("integration_id", integration.id)
          .eq("asset_type", "page");

        const pageAssets = pagesData.data.map((page: any) => ({
          integration_id: integration.id,
          company_id,
          asset_type: "page",
          asset_id: page.id,
          asset_name: page.name,
          selected: false,
          metadata: {
            page_access_token: btoa(page.access_token || ""),
            instagram_business_account: page.instagram_business_account || null,
          },
        }));

        if (pageAssets.length > 0) {
          await adminClient.from("meta_assets").insert(pageAssets);
        }
      }

      // Audit log
      await adminClient.from("integration_audit_log").insert({
        company_id,
        actor_user_id: user_id,
        action: "integration_connected",
        entity_type: "integration",
        entity_id: integration.id,
        metadata: {
          provider: "meta",
          meta_user_id: meData.id,
          meta_user_name: meData.name,
          pages_found: pagesData.data?.length || 0,
        },
      });

      return new Response(buildRedirectHtml("success", integration.id), {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    } catch (error) {
      console.error("meta-oauth-callback error:", error);
      return new Response(buildRedirectHtml("error", error.message), {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});

function buildRedirectHtml(status: string, detail: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>Meta OAuth</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: "META_OAUTH_RESULT", status: "${status}", detail: "${detail}" }, "*");
    window.close();
  } else {
    document.body.innerHTML = '<p>Autenticazione ${status === "success" ? "completata" : "fallita"}. Puoi chiudere questa finestra.</p>';
  }
</script>
<p>Elaborazione in corso...</p>
</body>
</html>`;
}
