import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { encrypt, getEncryptionKey } from "../_shared/encryption.ts";

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

Deno.serve(async (req) => {
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

      // Store token with AES-GCM encryption
      const encKey = getEncryptionKey();
      const tokenEncrypted = await encrypt(accessToken, encKey);
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

      const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";

      // Fetch pages and save as assets (WITHOUT page access token in metadata)
      const pagesRes = await fetch(
        `https://graph.facebook.com/${apiVersion}/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username}&limit=100&access_token=${accessToken}`
      );
      const pagesData = await pagesRes.json();

      // Raccoglie pagine personali + pagine da Business Manager (deduplicate)
      const allPages: any[] = [...(pagesData.data || [])];
      const seenPageIds = new Set(allPages.map((p: any) => p.id));

      try {
        const bizRes = await fetch(
          `https://graph.facebook.com/${apiVersion}/me/businesses?fields=id,name&access_token=${accessToken}`
        );
        const bizData = await bizRes.json();

        for (const biz of bizData.data || []) {
          try {
            const bpRes = await fetch(
              `https://graph.facebook.com/${apiVersion}/${biz.id}/owned_pages` +
              `?fields=id,name,access_token,instagram_business_account{id,name,username}&access_token=${accessToken}`
            );
            const bpData = await bpRes.json();
            for (const page of bpData.data || []) {
              if (!seenPageIds.has(page.id)) {
                allPages.push({ ...page, _biz_name: biz.name });
                seenPageIds.add(page.id);
              }
            }
          } catch (bizPageErr: any) {
            console.warn(`BM pages fetch failed for biz ${biz.id}:`, bizPageErr.message);
          }
        }
      } catch (bizErr: any) {
        console.warn("Business Manager fetch failed (non-fatal):", bizErr.message);
      }

      if (allPages.length > 0) {
        // Clear old page assets for this integration
        await adminClient
          .from("meta_assets")
          .delete()
          .eq("integration_id", integration.id)
          .eq("asset_type", "page");

        // Store page access tokens separately in integration_credentials-like storage
        // NOT in meta_assets.metadata (which is client-readable via RLS)
        const pageAssets = allPages.map((page: any) => ({
          integration_id: integration.id,
          company_id,
          asset_type: "page",
          asset_id: page.id,
          asset_name: page.name,
          selected: false,
          metadata: {
            instagram_business_account: page.instagram_business_account || null,
            biz_name: page._biz_name || null,
            // page_access_token intentionally NOT stored here (security: RLS-readable)
          },
        }));

        await adminClient.from("meta_assets").insert(pageAssets);

        // Store page tokens in a secure way: save them in integration_credentials metadata
        // keyed by page_id for retrieval by the proxy
        const pageTokenMap: Record<string, string> = {};
        for (const page of allPages) {
          if (page.access_token) {
            pageTokenMap[page.id] = await encrypt(page.access_token, encKey);
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
          pages_found: allPages.length,
          personal_pages: pagesData.data?.length || 0,
          bm_pages: allPages.length - (pagesData.data?.length || 0),
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
  const siteUrl = Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
  const allowedOriginsJson = JSON.stringify([
    siteUrl,
    `https://${projectRef}.supabase.co`,
  ].filter(Boolean));
  const safeStatus = status === "success" ? "success" : "error";
  const safeDetail = detail ? detail.replace(/[<>"']/g, "") : "";
  return `<!DOCTYPE html>
<html>
<head><title>Meta OAuth</title></head>
<body>
<script>
  var allowedOrigins = ${allowedOriginsJson};
  if (window.opener) {
    var msg = { type: "META_OAUTH_RESULT", status: "${safeStatus}", detail: "${safeDetail}" };
    allowedOrigins.forEach(function(origin) {
      try { window.opener.postMessage(msg, origin); } catch(e) {}
    });
    try { window.opener.postMessage(msg, window.location.origin); } catch(e) {}
    try { window.opener.postMessage(msg, "*"); } catch(e) {}
    window.close();
  } else {
    document.body.innerHTML = '<p>Autenticazione ${safeStatus === "success" ? "completata" : "fallita"}. Puoi chiudere questa finestra.</p>';
  }
</script>
<p>Elaborazione in corso...</p>
</body>
</html>`;
}
