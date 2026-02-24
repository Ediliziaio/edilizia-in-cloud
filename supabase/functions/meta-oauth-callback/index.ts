import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

serve(async (req) => {
  const url = new URL(req.url);

  // Handle GET (browser redirect from Meta)
  if (req.method === "GET") {
    const code = url.searchParams.get("code");
    const signedState = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      return new Response(buildRedirectHtml("error", errorParam), {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }

    if (!code || !signedState) {
      return new Response(buildRedirectHtml("error", "missing_params"), {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }

    try {
      const { metaAppId, metaAppSecret } = await getMetaCredentials();

      // Validate HMAC-signed state
      const dotIndex = signedState.lastIndexOf(".");
      if (dotIndex === -1) {
        return new Response(buildRedirectHtml("error", "invalid_state"), {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }

      const stateB64 = signedState.slice(0, dotIndex);
      const receivedHmac = signedState.slice(dotIndex + 1);

      // Verify HMAC
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(metaAppSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(stateB64));
      const expectedHmac = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");

      if (receivedHmac !== expectedHmac) {
        console.error("State HMAC validation failed");
        return new Response(buildRedirectHtml("error", "invalid_state_signature"), {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }

      // Decode state
      const statePayload = JSON.parse(atob(stateB64));
      const { company_id, user_id, ts } = statePayload;

      if (!company_id || !user_id || !ts) {
        return new Response(buildRedirectHtml("error", "invalid_state"), {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }

      // Check timestamp (10 min max)
      if (Date.now() - ts > STATE_MAX_AGE_MS) {
        return new Response(buildRedirectHtml("error", "state_expired"), {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

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

      // Store token (base64 encoded — documented as MVP; use pgcrypto in production)
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

      // Fetch pages and save as assets (WITHOUT page access token in metadata)
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

        // Store page access tokens separately in integration_credentials-like storage
        // NOT in meta_assets.metadata (which is client-readable via RLS)
        const pageAssets = pagesData.data.map((page: any) => ({
          integration_id: integration.id,
          company_id,
          asset_type: "page",
          asset_id: page.id,
          asset_name: page.name,
          selected: false,
          metadata: {
            instagram_business_account: page.instagram_business_account || null,
            // page_access_token intentionally NOT stored here (security: RLS-readable)
          },
        }));

        if (pageAssets.length > 0) {
          await adminClient.from("meta_assets").insert(pageAssets);
        }

        // Store page tokens in a secure way: save them in integration_credentials metadata
        // keyed by page_id for retrieval by the proxy
        const pageTokenMap: Record<string, string> = {};
        for (const page of pagesData.data) {
          if (page.access_token) {
            pageTokenMap[page.id] = btoa(page.access_token);
          }
        }
        // Update the integration credential with page tokens
        await adminClient
          .from("integration_credentials")
          .update({
            meta_page_tokens: pageTokenMap,
            updated_at: new Date().toISOString(),
          })
          .eq("integration_id", integration.id);
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
