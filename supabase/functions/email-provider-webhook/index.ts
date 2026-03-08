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
}

function normalizeEvents(body: any, stream: string): NormalizedEvent[] {
  // SendGrid sends an array of events
  if (Array.isArray(body)) {
    return body.map((ev: any) => ({
      type: mapSendGridEvent(ev.event),
      providerMessageId: ev.sg_message_id?.split(".")?.[0],
      email: ev.email,
      reason: ev.reason || ev.response,
      timestamp: ev.timestamp ? new Date(ev.timestamp * 1000).toISOString() : undefined,
    }));
  }

  // Brevo
  if (body.event && body["message-id"]) {
    return [{
      type: mapBrevoEvent(body.event),
      providerMessageId: body["message-id"],
      email: body.email,
      reason: body.reason,
      timestamp: body.date,
    }];
  }

  // Elastic Email
  if (body.status && body.msgID) {
    return [{
      type: mapElasticEvent(body.status),
      providerMessageId: body.msgID,
      email: body.to,
      reason: body.error_category,
      timestamp: body.date,
    }];
  }

  // Mailgun
  if (body["event-data"] || body.event) {
    const ev = body["event-data"] || body;
    return [{
      type: mapMailgunEvent(ev.event),
      providerMessageId: ev.message?.headers?.["message-id"],
      email: ev.recipient,
      reason: ev["delivery-status"]?.description,
      timestamp: ev.timestamp ? new Date(Number(ev.timestamp) * 1000).toISOString() : undefined,
    }];
  }

  // Resend
  if (body.type && body.data) {
    return [{
      type: mapResendEvent(body.type),
      providerMessageId: body.data?.email_id,
      email: body.data?.to?.[0],
      reason: body.data?.bounce?.message,
      timestamp: body.created_at,
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
