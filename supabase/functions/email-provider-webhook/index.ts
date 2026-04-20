import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as baseCorsHeaders, secureHeaders } from "../_shared/headers.ts";

const corsHeaders = {
  ...baseCorsHeaders,
};

/**
 * Normalizes webhook events from different email providers into a common format.
 * Supports: SendGrid, Brevo, Elastic Email, Mailgun, Resend
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Accept GET for Mailgun verification
  if (req.method === "GET") {
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  // Verifica token segreto webhook (SEC-012)
  // Il provider deve includere ?secret=TOKEN nell'URL o l'header x-webhook-secret
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (webhookSecret) {
    const reqUrl = new URL(req.url);
    const providedSecret =
      reqUrl.searchParams.get("secret") ||
      req.headers.get("x-webhook-secret");
    if (providedSecret !== webhookSecret) {
      console.error("email-provider-webhook: token segreto non valido");
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
  } else {
    return new Response(
      JSON.stringify({ error: "WEBHOOK_SECRET not configured — endpoint disabled for security" }),
      { status: 503, headers: corsHeaders }
    );
  }

  try {
    const url = new URL(req.url);
    const stream = url.searchParams.get("stream") || "marketing";

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const contentType = req.headers.get("content-type") || "";
    let rawBody: any;

    if (contentType.includes("application/json")) {
      rawBody = await req.json();
    } else if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      rawBody = Object.fromEntries(formData.entries());
    } else {
      rawBody = await req.json().catch(() => null);
    }

    if (!rawBody) {
      return new Response("No body", { status: 400, headers: corsHeaders });
    }

    // Normalize events
    const events = normalizeEvents(rawBody, stream);

    // Process each event
    for (const event of events) {
      const now = new Date().toISOString();

      if (event.providerMessageId) {
        // Find the email_log by provider_message_id
        const { data: log } = await adminClient
          .from("email_logs")
          .select("id, status")
          .eq("provider_message_id", event.providerMessageId)
          .limit(1)
          .maybeSingle();

        if (log) {
          const updates: Record<string, any> = {};

          switch (event.type) {
            case "delivered":
              updates.status = "delivered";
              break;
            case "opened":
              updates.opened_at = now;
              break;
            case "clicked":
              updates.clicked_at = now;
              if (!log.status || log.status !== "delivered") updates.status = "delivered";
              break;
            case "bounced":
              updates.status = "bounced";
              updates.error_message = event.reason || "Bounced";
              break;
            case "spam":
              updates.status = "spam";
              break;
            case "unsubscribed":
              updates.status = "unsubscribed";
              break;
            case "dropped":
            case "deferred":
              updates.status = event.type;
              updates.error_message = event.reason || null;
              break;
          }

          if (Object.keys(updates).length > 0) {
            await adminClient
              .from("email_logs")
              .update(updates)
              .eq("id", log.id);
          }
        }

        // Mirror status updates on the unified email_delivery_log so the
        // SuperAdmin dashboard, audit log and P&L all reflect provider events
        // for transactional sends (which don't live in email_logs).
        const deliveryUpdate: Record<string, unknown> = {};
        switch (event.type) {
          case "delivered":
            deliveryUpdate.status = "delivered";
            break;
          case "bounced":
            deliveryUpdate.status = "bounced";
            if (event.reason) deliveryUpdate.error_message = event.reason;
            break;
          case "spam":
            deliveryUpdate.status = "spam";
            break;
          case "dropped":
          case "deferred":
            deliveryUpdate.status = event.type;
            if (event.reason) deliveryUpdate.error_message = event.reason;
            break;
          case "unsubscribed":
            deliveryUpdate.status = "unsubscribed";
            break;
        }
        if (Object.keys(deliveryUpdate).length > 0) {
          await adminClient
            .from("email_delivery_log")
            .update(deliveryUpdate)
            .eq("provider_id", event.providerMessageId);
        }
      }

      // BUG-03: Hard bounce or spam → mark contact as unsubscribed to prevent future sends
      if ((event.type === "bounced" || event.type === "spam") && event.email) {
        await adminClient
          .from("marketing_contacts")
          .update({ email_unsubscribed: true, email_unsubscribed_at: now })
          .eq("email", event.email);

        // GAP-13: Add to global suppression list (upsert — ignore if already present)
        await adminClient
          .from("email_suppressions")
          .upsert(
            { email: event.email, reason: event.type === "bounced" ? "bounce" : "spam", suppressed_at: now },
            { onConflict: "email", ignoreDuplicates: true }
          );
      }

      // S0.6: su HARD bounce rifondi il credito email al wallet dell'azienda.
      // Chiama refund_email_credit_on_bounce, che è idempotente: se il
      // message_id è già stato rifondato NON viene emesso un nuovo refund.
      // Per evitare refund su soft bounce (temporanei, il provider riproverà),
      // rifondiamo SOLO se il provider dichiara hard bounce esplicitamente.
      if (
        event.type === "bounced" &&
        event.isHardBounce === true &&
        event.providerMessageId
      ) {
        try {
          const { data: refundResult, error: refundErr } = await adminClient.rpc(
            "refund_email_credit_on_bounce",
            {
              p_provider_message_id: event.providerMessageId,
              p_reason: event.reason || "hard_bounce",
            },
          );
          if (refundErr) {
            console.error("[email-provider-webhook] refund error:", refundErr);
          } else {
            console.log("[email-provider-webhook] refund result:", refundResult);
          }
        } catch (refundCatch) {
          console.error("[email-provider-webhook] refund threw:", refundCatch);
        }
      }
    }

    return new Response(JSON.stringify({ processed: events.length }), {
      status: 200,
      headers: secureHeaders,
    });
  } catch (err: any) {
    console.error("email-provider-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: secureHeaders,
    });
  }
});

interface NormalizedEvent {
  type: "delivered" | "opened" | "clicked" | "bounced" | "spam" | "unsubscribed" | "dropped" | "deferred" | "unknown";
  providerMessageId?: string;
  email?: string;
  reason?: string;
  timestamp?: string;
  /**
   * true = hard bounce (permanent, indirizzo invalido). Rifondiamo il credito.
   * false = soft bounce (temporaneo, il provider riproverà).
   * undefined = ambiguo, no refund.
   */
  isHardBounce?: boolean;
}

function normalizeEvents(body: any, stream: string): NormalizedEvent[] {
  // SendGrid sends an array of events.
  // Hard bounce detection: SendGrid marks `type: 'bounce'` con `bounce_classification`,
  // oppure `type: 'blocked'` = soft. `event: 'bounce'` + `bounce_classification` in {"Invalid Address"} = hard.
  if (Array.isArray(body)) {
    return body.map((ev: any) => ({
      type: mapSendGridEvent(ev.event),
      providerMessageId: ev.sg_message_id?.split(".")?.[0],
      email: ev.email,
      reason: ev.reason || ev.response,
      timestamp: ev.timestamp ? new Date(ev.timestamp * 1000).toISOString() : undefined,
      isHardBounce: ev.event === "bounce"
        ? (ev.type === "bounce"
          || String(ev.bounce_classification || "").toLowerCase().includes("invalid")
          || String(ev.reason || "").toLowerCase().includes("does not exist"))
        : undefined,
    }));
  }

  // Brevo: distingue hard_bounce vs soft_bounce esplicitamente
  if (body.event && body["message-id"]) {
    return [{
      type: mapBrevoEvent(body.event),
      providerMessageId: body["message-id"],
      email: body.email,
      reason: body.reason,
      timestamp: body.date,
      isHardBounce: body.event === "hard_bounce" ? true
        : body.event === "soft_bounce" ? false
        : undefined,
    }];
  }

  // Elastic Email: bounce_category "HardBounce" / "Hard" = hard
  if (body.status && body.msgID) {
    const cat = String(body.error_category || body.bounce_category || "").toLowerCase();
    return [{
      type: mapElasticEvent(body.status),
      providerMessageId: body.msgID,
      email: body.to,
      reason: body.error_category,
      timestamp: body.date,
      isHardBounce: body.status === "Bounced"
        ? (cat.includes("hard") || cat.includes("noMailbox") || cat.includes("badaddress") ? true : undefined)
        : undefined,
    }];
  }

  // Mailgun: `severity: permanent` = hard, `severity: temporary` = soft
  if (body["event-data"] || body.event) {
    const ev = body["event-data"] || body;
    const severity = String(ev.severity || ev["delivery-status"]?.severity || "").toLowerCase();
    return [{
      type: mapMailgunEvent(ev.event),
      providerMessageId: ev.message?.headers?.["message-id"],
      email: ev.recipient,
      reason: ev["delivery-status"]?.description,
      timestamp: ev.timestamp ? new Date(Number(ev.timestamp) * 1000).toISOString() : undefined,
      isHardBounce: ev.event === "failed"
        ? (severity === "permanent" ? true : severity === "temporary" ? false : undefined)
        : undefined,
    }];
  }

  // Resend: bounce.type "Permanent" / "Transient"
  if (body.type && body.data) {
    const btype = String(body.data?.bounce?.type || "").toLowerCase();
    return [{
      type: mapResendEvent(body.type),
      providerMessageId: body.data?.email_id,
      email: body.data?.to?.[0],
      reason: body.data?.bounce?.message,
      timestamp: body.created_at,
      isHardBounce: body.type === "email.bounced"
        ? (btype === "permanent" ? true : btype === "transient" ? false : undefined)
        : undefined,
    }];
  }

  return [];
}

function mapSendGridEvent(event: string): NormalizedEvent["type"] {
  const map: Record<string, NormalizedEvent["type"]> = {
    delivered: "delivered", open: "opened", click: "clicked",
    bounce: "bounced", spamreport: "spam", unsubscribe: "unsubscribed",
    dropped: "dropped", deferred: "deferred",
  };
  return map[event] || "unknown";
}

function mapBrevoEvent(event: string): NormalizedEvent["type"] {
  const map: Record<string, NormalizedEvent["type"]> = {
    delivered: "delivered", opened: "opened", click: "clicked",
    hard_bounce: "bounced", soft_bounce: "bounced", complaint: "spam",
    unsubscribed: "unsubscribed",
  };
  return map[event] || "unknown";
}

function mapElasticEvent(status: string): NormalizedEvent["type"] {
  const map: Record<string, NormalizedEvent["type"]> = {
    Sent: "delivered", Opened: "opened", Clicked: "clicked",
    Bounced: "bounced", Complaint: "spam", Unsubscribed: "unsubscribed",
    Error: "dropped",
  };
  return map[status] || "unknown";
}

function mapMailgunEvent(event: string): NormalizedEvent["type"] {
  const map: Record<string, NormalizedEvent["type"]> = {
    delivered: "delivered", opened: "opened", clicked: "clicked",
    failed: "bounced", complained: "spam", unsubscribed: "unsubscribed",
  };
  return map[event] || "unknown";
}

function mapResendEvent(type: string): NormalizedEvent["type"] {
  const map: Record<string, NormalizedEvent["type"]> = {
    "email.delivered": "delivered", "email.opened": "opened",
    "email.clicked": "clicked", "email.bounced": "bounced",
    "email.complained": "spam",
  };
  return map[type] || "unknown";
}
