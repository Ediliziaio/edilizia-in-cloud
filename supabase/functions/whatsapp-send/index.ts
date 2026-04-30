import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptMaybeEncrypted, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth: Bearer token (user) OR x-cron-secret (internal service) ──
    const authHeader = req.headers.get("Authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const internalSecret =
      Deno.env.get("INTERNAL_CRON_SECRET") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let isAuthenticated = false;

    if (cronSecret && cronSecret === internalSecret) {
      isAuthenticated = true;
    } else if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const {
        data: { user },
        error: authErr,
      } = await supabaseUser.auth.getUser(token);
      if (!authErr && user) {
        isAuthenticated = true;
      }
    }

    if (!isAuthenticated) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    // ── Parse body ──────────────────────────────────────────────────────
    const {
      company_id,
      to,
      type,
      text,
      interactive,
      template,
      log_message = true,
    } = await req.json();

    if (!company_id || !to || !type) {
      return new Response(
        JSON.stringify({
          error: "Parametri mancanti: company_id, to, type sono obbligatori",
        }),
        { status: 400, headers: jsonHeaders }
      );
    }

    if (!["text", "interactive", "template"].includes(type)) {
      return new Response(
        JSON.stringify({
          error: "Tipo non valido. Valori ammessi: text, interactive, template",
        }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Load WhatsApp config ────────────────────────────────────────────
    const { data: waConfig } = await adminClient
      .from("messaging_whatsapp_config")
      .select("phone_number_id, access_token_encrypted")
      .eq("company_id", company_id)
      .eq("is_connected", true)
      .maybeSingle();

    if (!waConfig?.phone_number_id || !waConfig?.access_token_encrypted) {
      return new Response(
        JSON.stringify({
          error: "WhatsApp non configurato per questa azienda",
        }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // ── Decrypt access token ────────────────────────────────────────────
    const encKey = getEncryptionKey();
    const accessToken = await decryptMaybeEncrypted(waConfig.access_token_encrypted, encKey);

    // ── Build Meta Graph API payload ────────────────────────────────────
    const cleanPhone = to.replace(/[^0-9]/g, "");
    if (!cleanPhone) {
      return new Response(
        JSON.stringify({ error: "Numero di telefono non valido" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type,
    };

    if (type === "text") {
      if (!text?.body) {
        return new Response(
          JSON.stringify({ error: "Campo text.body obbligatorio per tipo text" }),
          { status: 400, headers: jsonHeaders }
        );
      }
      payload.text = { body: text.body };
    } else if (type === "interactive") {
      if (!interactive?.type || !interactive?.body || !interactive?.action) {
        return new Response(
          JSON.stringify({
            error:
              "Campi interactive.type, interactive.body, interactive.action obbligatori per tipo interactive",
          }),
          { status: 400, headers: jsonHeaders }
        );
      }
      payload.interactive = {
        type: interactive.type, // 'button' | 'list'
        body: interactive.body,
        action: interactive.action,
        ...(interactive.header ? { header: interactive.header } : {}),
        ...(interactive.footer ? { footer: interactive.footer } : {}),
      };
    } else if (type === "template") {
      if (!template?.name || !template?.language) {
        return new Response(
          JSON.stringify({
            error:
              "Campi template.name e template.language obbligatori per tipo template",
          }),
          { status: 400, headers: jsonHeaders }
        );
      }
      payload.template = {
        name: template.name,
        language: template.language,
        ...(template.components ? { components: template.components } : {}),
      };
    }

    // ── Call Meta Graph API ──────────────────────────────────────────────
    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const metaResult = await metaRes.json();

    if (!metaRes.ok) {
      console.error("[whatsapp-send] Meta API error:", metaResult);
      return new Response(
        JSON.stringify({
          error: metaResult.error?.message || "Errore invio WhatsApp",
          meta_error: metaResult.error,
        }),
        { status: 502, headers: jsonHeaders }
      );
    }

    const metaMessageId = metaResult.messages?.[0]?.id || null;

    // ── Log outbound message ────────────────────────────────────────────
    if (log_message) {
      let logContent = "";
      if (type === "text") {
        logContent = text.body;
      } else if (type === "interactive") {
        logContent = interactive.body?.text || JSON.stringify(interactive);
      } else if (type === "template") {
        logContent = `[Template: ${template.name}]`;
      }

      const { error: logErr } = await adminClient
        .from("whatsapp_messages")
        .insert({
          company_id,
          direction: "outbound",
          phone_number: cleanPhone,
          message_type: type,
          content: logContent,
          meta_message_id: metaMessageId,
          status: "sent",
          created_at: new Date().toISOString(),
        });

      if (logErr) {
        console.error("[whatsapp-send] Log insert error:", logErr);
      }
    }

    // ── Response ────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        meta_message_id: metaMessageId,
      }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Errore interno del server";
    console.error("[whatsapp-send] Error:", err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        ...getCorsHeaders(req),
        "Content-Type": "application/json",
      },
    });
  }
});
