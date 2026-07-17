import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { encrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { timingSafeEqual } from "../_shared/webhookSecurity.ts";

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes


Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Handle GET (browser redirect from Meta)
  if (req.method === "GET") {
    const code = url.searchParams.get("code");
    const signedState = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      return redirectToApp("error", errorParam);
    }

    if (!code || !signedState) {
      return redirectToApp("error", "missing_params");
    }

    try {
      const { metaAppId, metaAppSecret } = await getMetaCredentials();

      // Validate HMAC-signed state
      const dotIndex = signedState.lastIndexOf(".");
      if (dotIndex === -1) {
        return redirectToApp("error", "invalid_state");
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

      // Timing-safe comparison: previene timing attack sul state OAuth
      if (!timingSafeEqual(receivedHmac, expectedHmac)) {
        console.error("State HMAC validation failed");
        return redirectToApp("error", "invalid_state_signature");
      }

      // Decode state
      const statePayload = JSON.parse(atob(stateB64));
      const { company_id, user_id, ts } = statePayload;

      if (!company_id || !user_id || !ts) {
        return redirectToApp("error", "invalid_state");
      }

      // Check timestamp (10 min max)
      if (Date.now() - ts > STATE_MAX_AGE_MS) {
        return redirectToApp("error", "state_expired");
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      const [profileRes, rolesRes] = await Promise.all([
        adminClient
          .from("profiles")
          .select("company_id")
          .eq("id", user_id)
          .maybeSingle(),
        adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", user_id),
      ]);
      const userCompanyId = profileRes.data?.company_id ?? null;
      const isSuperAdmin = (rolesRes.data ?? []).some((r) => r.role === "super_admin");
      if (!isSuperAdmin && userCompanyId !== company_id) {
        console.error("OAuth state user/company validation failed");
        return redirectToApp("error", "invalid_state_company");
      }

      // Exchange code for short-lived token
      const callbackUrl = `${supabaseUrl}/functions/v1/meta-oauth-callback`;
      const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(callbackUrl)}&client_secret=${metaAppSecret}&code=${code}`;

      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        console.error("Meta token exchange error:", tokenData.error);
        return redirectToApp("error", "token_exchange_failed");
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

      // STEP 1: Upsert integration in stato "pending" — non "connected" finché
      // le credenziali non sono salvate. Previene race dove UI mostra
      // "connected" ma token non è ancora presente in DB.
      const { data: integration, error: integErr } = await adminClient
        .from("integrations")
        .upsert(
          {
            company_id,
            provider: "meta",
            status: "pending",
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
        return redirectToApp("error", "db_error");
      }

      // STEP 2: Store token with AES-GCM encryption
      const encKey = getEncryptionKey();
      const tokenEncrypted = await encrypt(accessToken, encKey);
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Delete old credentials and insert new
      await adminClient
        .from("integration_credentials")
        .delete()
        .eq("integration_id", integration.id);

      const { error: credErr } = await adminClient
        .from("integration_credentials")
        .insert({
          integration_id: integration.id,
          access_token_encrypted: tokenEncrypted,
          token_type: "bearer",
          expires_at: expiresAt,
          granted_scopes: tokenData.scope ? tokenData.scope.split(",") : [],
          meta_user_id: meData.id || null,
          meta_user_name: meData.name || null,
        });

      if (credErr) {
        console.error("Credentials insert error:", credErr);
        // ROLLBACK: metti integration in stato error per chiarezza — health check
        // rileverà il problema e mostrerà UI "riconnetti"
        await adminClient
          .from("integrations")
          .update({
            status: "error",
            health: "error",
            last_error_code: "credentials_insert_failed",
            last_error_message: credErr.message,
          })
          .eq("id", integration.id);
        return redirectToApp("error", "credentials_storage_failed");
      }

      // NB: la promozione a "connected" avviene DOPO l'inserimento delle
      // pagine (più sotto), così il frontend che rileva "connected" tramite
      // polling trova SEMPRE gli asset già pronti — niente picker vuoto per
      // race tra flip di stato e insert pagine.
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

        // Fetch owned_pages di TUTTI i Business Manager in parallelo: con
        // account "agenzia" (molti BM) il fetch sequenziale teneva il popup
        // sul grigio anche un minuto.
        const bizResults = await Promise.all(
          (bizData.data || []).map(async (biz: any) => {
            try {
              const bpRes = await fetch(
                `https://graph.facebook.com/${apiVersion}/${biz.id}/owned_pages` +
                `?fields=id,name,access_token,instagram_business_account{id,name,username}&access_token=${accessToken}`
              );
              const bpData = await bpRes.json();
              return { biz, pages: (bpData.data || []) as any[] };
            } catch (bizPageErr: any) {
              console.warn(`BM pages fetch failed for biz ${biz.id}:`, bizPageErr.message);
              return { biz, pages: [] as any[] };
            }
          })
        );
        for (const { biz, pages } of bizResults) {
          for (const page of pages) {
            if (!seenPageIds.has(page.id)) {
              allPages.push({ ...page, _biz_name: biz.name });
              seenPageIds.add(page.id);
            }
          }
        }
      } catch (bizErr: any) {
        console.warn("Business Manager fetch failed (non-fatal):", bizErr.message);
      }

      // Fetch AD ACCOUNTS: senza questi asset la Gestione Pubblicitaria mostra
      // "Account pubblicitario assente" e il wizard campagne resta bloccato
      // (il callback salvava solo pages/businesses). Scope: ads_read (richiesto).
      // NB multi-tenant: come per le pagine, /me/adaccounts può includere
      // account di altri clienti di un'agenzia — la pagina Ads usa il primo,
      // una selezione esplicita è un miglioramento futuro del wizard.
      try {
        const adRes = await fetch(
          `https://graph.facebook.com/${apiVersion}/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${accessToken}`
        );
        const adData = await adRes.json();
        const adAccounts: any[] = adData.data || [];
        if (adAccounts.length > 0) {
          // Preserva le selezioni esistenti prima del refresh (un ri-OAuth non
          // deve azzerare la scelta dell'account fatta dall'azienda).
          const { data: prevSel } = await adminClient
            .from("meta_assets")
            .select("asset_id")
            .eq("integration_id", integration.id)
            .eq("asset_type", "ad_account")
            .eq("selected", true);
          const prevSelected = new Set((prevSel ?? []).map((r: any) => r.asset_id));

          await adminClient
            .from("meta_assets")
            .delete()
            .eq("integration_id", integration.id)
            .eq("asset_type", "ad_account");
          await adminClient.from("meta_assets").insert(
            adAccounts.map((acc: any) => ({
              integration_id: integration.id,
              company_id,
              asset_type: "ad_account",
              asset_id: acc.id, // formato act_<numero>
              asset_name: acc.name || acc.id,
              // selected=true SOLO se già scelto prima o se è l'unico account:
              // un utente agenzia vede DECINE di account di altri clienti e la
              // campagna finirebbe sull'account sbagliato.
              selected: prevSelected.has(acc.id) || adAccounts.length === 1,
              metadata: { account_status: acc.account_status ?? null, currency: acc.currency ?? null },
            })),
          );
        }
      } catch (adErr: any) {
        console.warn("Ad accounts fetch failed (non-fatal):", adErr.message);
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

      // Ora che le pagine sono inserite, promuovi a "connected": così il
      // frontend (che rileva la connessione via polling) trova gli asset già
      // pronti e non mostra il picker vuoto.
      await adminClient
        .from("integrations")
        .update({ status: "connected" })
        .eq("id", integration.id);

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

      return redirectToApp("success", integration.id);
    } catch (error) {
      console.error("meta-oauth-callback error:", error);
      // MAI il messaggio interno nell'URL visto dall'utente: codice generico,
      // il dettaglio vero resta nei log della funzione.
      return redirectToApp("error", "internal_error");
    }
  }

  return new Response("Method not allowed", { status: 405 });
});

// La piattaforma Supabase RISCRIVE le risposte HTML delle edge function sul
// dominio condiviso *.supabase.co (Content-Type forzato a text/plain + CSP
// "default-src 'none'; sandbox", anti-phishing): il popup mostrava il
// SORGENTE della pagina e lo script postMessage non girava mai. Quindi qui
// niente HTML: 302 verso /meta-oauth-done sull'app (stessa origin
// dell'opener), che consegna il risultato via postMessage e si chiude.
function redirectToApp(status: string, detail: string): Response {
  const siteUrl = Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
  const safeStatus = status === "success" ? "success" : "error";
  const safeDetail = (detail || "").replace(/[<>"']/g, "").slice(0, 200);
  const hash = new URLSearchParams({ status: safeStatus, detail: safeDetail }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${siteUrl}/meta-oauth-done#${hash}`,
      "Cache-Control": "no-store",
    },
  });
}
