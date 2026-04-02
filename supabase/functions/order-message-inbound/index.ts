// order-message-inbound — Edge Function EiC
// Webhook per ricevere RISPOSTE del cliente da SendGrid, Telnyx, Meta (WhatsApp)
// Registrare questo URL nei dashboard dei 3 provider:
//   https://{project}.supabase.co/functions/v1/order-message-inbound?source=sendgrid
//   https://{project}.supabase.co/functions/v1/order-message-inbound?source=telnyx
//   https://{project}.supabase.co/functions/v1/order-message-inbound?source=meta

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const source = url.searchParams.get("source"); // 'sendgrid' | 'telnyx' | 'meta'

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── SendGrid Inbound Parse ──────────────────────────────────────────────────
  if (source === "sendgrid") {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return new Response("invalid form data", { status: 400 });
    }

    const from    = form.get("from")?.toString() || "";
    const to      = form.get("to")?.toString() || "";
    const subject = form.get("subject")?.toString() || "";
    const text    = form.get("text")?.toString() || "";
    const headers = form.get("headers")?.toString() || "";

    // Cerca il message-id originale in In-Reply-To
    const inReplyToMatch = headers.match(/In-Reply-To:\s*<([^>]+)>/i);
    const inReplyTo = inReplyToMatch?.[1] || null;

    if (inReplyTo) {
      const { data: orig } = await supabase
        .from("order_messages")
        .select("id, order_id, company_id")
        .eq("external_id", inReplyTo)
        .single();

      if (orig) {
        await supabase.from("order_messages").insert({
          order_id:     orig.order_id,
          company_id:   orig.company_id,
          channel:      "email",
          direction:    "in",
          to_email:     to,
          to_name:      "",
          subject,
          body:         text,
          status:       "delivered",
          delivered_at: new Date().toISOString(),
          reply_to_id:  orig.id,
          provider_meta: { from },
        });
      }
    }

    return new Response("ok");
  }

  // ── Telnyx SMS ──────────────────────────────────────────────────────────────
  if (source === "telnyx") {
    let event: Record<string, unknown>;
    try {
      event = await req.json();
    } catch {
      return new Response("invalid json", { status: 400 });
    }

    const evtData = (event as any).data;
    if (evtData?.event_type === "message.received") {
      const msg = evtData.payload;
      const fromPhone: string = msg.from?.phone_number || "";

      // Trova l'ordine tramite l'ultimo messaggio out verso quel numero
      const { data: orig } = await supabase
        .from("order_messages")
        .select("id, order_id, company_id")
        .eq("to_phone", fromPhone)
        .eq("channel", "sms")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (orig) {
        await supabase.from("order_messages").insert({
          order_id:     orig.order_id,
          company_id:   orig.company_id,
          channel:      "sms",
          direction:    "in",
          to_phone:     fromPhone,
          body:         msg.text || "",
          status:       "delivered",
          delivered_at: new Date().toISOString(),
          reply_to_id:  orig.id,
          provider_meta: { telnyx_id: msg.id },
        });
      }
    }

    return new Response("ok");
  }

  // ── Meta WhatsApp ───────────────────────────────────────────────────────────
  if (source === "meta") {
    // GET: verifica webhook Meta (hub verification)
    if (req.method === "GET") {
      const mode      = url.searchParams.get("hub.mode");
      const token     = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN");

      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return new Response(challenge ?? "", { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    }

    // POST: messaggio in arrivo
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response("invalid json", { status: 400 });
    }

    const entry  = (body.entry as any[])?.[0];
    const change = entry?.changes?.[0];
    const waMsg  = change?.value?.messages?.[0];

    if (waMsg?.type === "text") {
      const fromPhone: string = waMsg.from;

      const { data: orig } = await supabase
        .from("order_messages")
        .select("id, order_id, company_id")
        .eq("to_phone", fromPhone)
        .eq("channel", "whatsapp")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (orig) {
        await supabase.from("order_messages").insert({
          order_id:     orig.order_id,
          company_id:   orig.company_id,
          channel:      "whatsapp",
          direction:    "in",
          to_phone:     fromPhone,
          body:         waMsg.text?.body || "",
          status:       "delivered",
          delivered_at: new Date().toISOString(),
          external_id:  waMsg.id,
          reply_to_id:  orig.id,
        });
      }

      // Risponde 200 immediatamente (Meta richiede risposta entro 20s)
      return new Response("ok");
    }

    return new Response("ok");
  }

  return new Response("Unknown source. Use ?source=sendgrid|telnyx|meta", { status: 400 });
});
