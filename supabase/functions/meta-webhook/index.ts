import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { leggiImpostazionePiattaforma } from "../_shared/getPlatformSetting.ts";
import { verifyHmacSha256 } from "../_shared/webhookSecurity.ts";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { estraiMessaggiSocial, registraMessaggiSocial } from "../_shared/socialMessaggiMeta.ts";
import { proprietarioPagina } from "../_shared/metaProprietarioPagina.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // GET - Meta webhook verification handshake
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Token di verifica: quello nelle variabili della funzione
    // (META_WEBHOOK_VERIFY_TOKEN) oppure quello nelle impostazioni di
    // piattaforma (meta_webhook_verify_token), dove lo legge chi configura i
    // webhook nel pannello Meta. Il 14/09 i due erano diversi: il token delle
    // impostazioni veniva rifiutato e l'oggetto Instagram non si poteva
    // registrare. Fail-closed: nessun fallback al token WhatsApp.
    const tokenAccettati: string[] = [];
    const envToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "";
    if (envToken.length >= 16) tokenAccettati.push(envToken);
    // Dal 19/09/2026 il token delle impostazioni sta nel Vault.
    const dbToken = await leggiImpostazionePiattaforma("meta_webhook_verify_token");
    if (dbToken.length >= 16) tokenAccettati.push(dbToken);
    if (tokenAccettati.length === 0) {
      console.error("meta-webhook: nessun token di verifica configurato");
      return new Response("Configuration error", { status: 500 });
    }

    if (mode === "subscribe" && verifyToken && tokenAccettati.includes(verifyToken)) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    }

    return new Response("Verification failed", { status: 403 });
  }

  // POST - Receive webhook events
  if (req.method === "POST") {
    try {
      const body = await req.text();

      // Valida X-Hub-Signature-256 — SEC-016: fail-closed se secret non configurato
      const signature = req.headers.get("x-hub-signature-256");
      const { metaAppSecret: appSecret } = await getMetaCredentials();

      if (!appSecret) {
        console.error("meta-webhook: META_APP_SECRET non configurato — richiesta rifiutata");
        return new Response("Configuration error", { status: 500 });
      }
      if (!signature) {
        console.error("meta-webhook: x-hub-signature-256 mancante");
        return new Response("Missing signature", { status: 403 });
      }
      // P2-1: verifica HMAC timing-safe via helper condiviso.
      // Prima usavamo `signature !== hexSig` (exit al primo byte diverso):
      // vulnerabile a timing attack.
      const validSig = await verifyHmacSha256(body, signature, appSecret);
      if (!validSig) {
        console.error("meta-webhook: firma non valida");
        return new Response("Invalid signature", { status: 403 });
      }

      const payload = JSON.parse(body);

      // Messaggi diretti di Instagram (object "instagram") e Messenger
      // (object "page", entry.messaging). Arrivano solo se la pagina è iscritta
      // ai messaggi, cioè con meta_messaggi_attivi e i permessi approvati.
      // Un errore qui non deve mai fermare i lead qui sotto.
      const messaggiSocial = estraiMessaggiSocial(payload);
      if (messaggiSocial.length > 0) {
        try {
          const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          const esito = await registraMessaggiSocial(admin, messaggiSocial, {
            decrypt,
            encKey: getEncryptionKey(),
            apiVersion: Deno.env.get("META_API_VERSION") || "v21.0",
          });
          console.log("meta-webhook: messaggi social", JSON.stringify(esito));
        } catch (e) {
          console.error("meta-webhook: messaggi social non registrati:", e);
        }
      }

      // Only process leadgen events
      if (payload.object !== "page") {
        return new Response("OK", { status: 200 });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      // Flag per triggerare processing real-time solo se almeno 1 lead è
      // stato enqueued
      let hasEnqueued = false;

      // Process each entry
      for (const entry of payload.entry || []) {
        const pageId = entry.id;

        for (const change of entry.changes || []) {
          if (change.field !== "leadgen") continue;

          const leadgenId = change.value?.leadgen_id;
          const formId = change.value?.form_id;
          const adId = change.value?.ad_id;
          const createdTime = change.value?.created_time;

          if (!leadgenId) continue;

          // Find which integration/company owns this page
          const { data: pageAssets } = await adminClient
            .from("meta_assets")
            .select("integration_id, company_id")
            .eq("asset_id", String(pageId))
            .eq("asset_type", "page")
            .eq("selected", true);

          if (!pageAssets || pageAssets.length === 0) {
            console.warn(`No integration found for page ${pageId}`);
            continue;
          }

          // Pagina scelta in più aziende (un collegamento vecchio e scaduto
          // rimasto attaccato): il lead va a quella col collegamento vivo.
          let proprietario = pageAssets[0];
          if (pageAssets.length > 1) {
            const ids = pageAssets.map((a: { integration_id: string | null }) => a.integration_id).filter(Boolean);
            const { data: collegamenti } = await adminClient
              .from("integrations")
              .select("id, status, updated_at")
              .in("id", ids);
            proprietario = proprietarioPagina(pageAssets, collegamenti ?? []) ?? pageAssets[0];
          }

          const { integration_id, company_id } = proprietario;

          // Enqueue event (idempotent via unique constraint)
          const { error: insertErr } = await adminClient
            .from("integration_webhook_events")
            .upsert(
              {
                company_id,
                integration_id,
                provider: "meta",
                event_type: "leadgen",
                event_id: String(leadgenId),
                payload: {
                  leadgen_id: leadgenId,
                  form_id: formId,
                  ad_id: adId,
                  page_id: pageId,
                  created_time: createdTime,
                  raw: change.value,
                },
                status: "pending",
                received_at: new Date().toISOString(),
              },
              { onConflict: "company_id,provider,event_id", ignoreDuplicates: true }
            );

          if (insertErr) {
            console.error("Failed to enqueue webhook event:", insertErr);
          } else {
            hasEnqueued = true;
          }
        }
      }

      // REAL-TIME: se abbiamo enqueued almeno 1 lead, invochiamo
      // meta-process-leads IMMEDIATAMENTE (fire-and-forget).
      // Il cron ogni 2 minuti resta come fallback per retry di eventi falliti.
      // Evitiamo di aspettare la risposta per non superare 20s timeout Meta.
      if (hasEnqueued) {
        const cronSecret = Deno.env.get("CRON_SECRET");
        if (cronSecret) {
          // fire-and-forget: NON aspettiamo la fetch, usiamo .then() senza await
          fetch(`${supabaseUrl}/functions/v1/meta-process-leads`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-cron-secret": cronSecret,
            },
            body: "{}",
          }).catch((e) => {
            console.warn("meta-webhook: real-time invoke failed (fallback cron):", e.message);
          });
        }
      }

      // Always respond 200 quickly (entro ~100ms)
      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("meta-webhook error:", error);
      // Still respond 200 to prevent Meta from retrying
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
