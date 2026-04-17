// send-order-message — Edge Function EiC
// Invia messaggi email/SMS/WhatsApp/nota_interna dal Diario dell'Ordine
// e logga il record in order_messages.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

interface SendMessagePayload {
  order_id: string;
  channel: "email" | "sms" | "whatsapp" | "nota_interna";
  to_name: string;
  to_email?: string;
  to_phone?: string;
  subject?: string;
  body: string;
  template_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, first_name, last_name")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return new Response(JSON.stringify({ error: "Profile not found" }), {
      status: 403,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  let payload: SendMessagePayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { order_id, channel, to_name, to_email, to_phone, subject, body, template_id } = payload;

  if (!order_id || !channel || !body) {
    return new Response(JSON.stringify({ error: "Missing required fields: order_id, channel, body" }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // 1. Verifica che l'ordine appartenga alla company dell'utente
  const { data: order } = await supabase
    .from("orders")
    .select("id, company_id")
    .eq("id", order_id)
    .eq("company_id", profile.company_id)
    .single();

  if (!order) {
    return new Response(JSON.stringify({ error: "Order not found or access denied" }), {
      status: 404,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // 2. Crea record in pending
  const { data: msgRecord, error: insertErr } = await supabase
    .from("order_messages")
    .insert({
      order_id,
      company_id: profile.company_id,
      channel,
      direction: "out",
      to_name,
      to_email: channel === "email" ? to_email : null,
      to_phone: (channel === "sms" || channel === "whatsapp") ? to_phone : null,
      subject: channel === "email" ? subject : null,
      body,
      template_id: template_id || null,
      status: channel === "nota_interna" ? "delivered" : "pending",
      sent_by: user.id,
      sent_by_name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim(),
    })
    .select()
    .single();

  if (insertErr || !msgRecord) {
    return new Response(JSON.stringify({ error: insertErr?.message || "Insert failed" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // 3. Per nota_interna: nessun invio, ritorna subito
  if (channel === "nota_interna") {
    return new Response(JSON.stringify({ ok: true, id: msgRecord.id }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // 4. Invia via provider corretto
  let externalId: string | null = null;
  let sendError: string | null = null;

  try {
    if (channel === "email") {
      const result = await sendEmailUnified({
        companyId: profile.company_id,
        stream: "transactional",
        to: [to_email!],
        subject: subject || "(nessun oggetto)",
        html: body.replace(/\n/g, "<br>"),
        templateName: "order_message",
        adminClient: supabase,
        metadata: { order_id, message_id: msgRecord.id, channel: "email" },
      });
      if (!result.ok) throw new Error(`Email send failed (${result.status})`);
      externalId = result.providerMessageId || null;

    } else if (channel === "sms") {
      const { data: telnyxCfg } = await supabase
        .from("company_integrations")
        .select("config")
        .eq("company_id", profile.company_id)
        .eq("type", "telnyx")
        .single();
      if (!telnyxCfg) throw new Error("Telnyx non configurato per questa azienda");

      const cfg = telnyxCfg.config as Record<string, string>;
      const telRes = await fetch("https://api.telnyx.com/v2/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: cfg.from_number,
          to: to_phone,
          text: body,
        }),
      });
      const telJson = await telRes.json();
      externalId = (telJson as any)?.data?.id || null;

    } else if (channel === "whatsapp") {
      const { data: waCfg } = await supabase
        .from("whatsapp_integrations")
        .select("*")
        .eq("company_id", profile.company_id)
        .single();
      if (!waCfg) throw new Error("WhatsApp non configurato per questa azienda");

      const waRes = await fetch(
        `https://graph.facebook.com/v21.0/${waCfg.phone_number_id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${waCfg.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: to_phone!.replace(/[^0-9]/g, ""),
            type: "text",
            text: { body },
          }),
        }
      );
      const waJson = await waRes.json();
      externalId = (waJson as any)?.messages?.[0]?.id || null;
    }
  } catch (err) {
    sendError = (err as Error).message;
  }

  // 5. Aggiorna record con esito
  await supabase
    .from("order_messages")
    .update({
      status: sendError ? "failed" : "sent",
      sent_at: sendError ? null : new Date().toISOString(),
      external_id: externalId,
      failed_reason: sendError,
    })
    .eq("id", msgRecord.id);

  if (sendError) {
    return new Response(JSON.stringify({ error: sendError }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, id: msgRecord.id }), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
});
