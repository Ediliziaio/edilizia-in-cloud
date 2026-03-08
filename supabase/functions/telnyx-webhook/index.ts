import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, telnyx-signature-ed25519, telnyx-timestamp",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);

    // Telnyx sends events in { data: { event_type, payload, ... } } format
    const eventData = payload?.data;
    if (!eventData) {
      console.warn("telnyx-webhook: no data in payload");
      return new Response("OK", { status: 200 });
    }

    const eventType = eventData.event_type;
    const record = eventData.payload;

    console.log(`[telnyx-webhook] event_type=${eventType}`);

    switch (eventType) {
      // ── SMS Status Updates ──
      case "message.sent":
      case "message.delivered":
      case "message.failed":
      case "message.finalized": {
        const telnyxMsgId = record?.id;
        if (!telnyxMsgId) break;

        const statusMap: Record<string, string> = {
          "message.sent": "sent",
          "message.delivered": "delivered",
          "message.failed": "failed",
          "message.finalized": record?.to?.[0]?.status === "delivered" ? "delivered" : "sent",
        };

        const newStatus = statusMap[eventType] || "unknown";
        const costAmount = record?.cost?.amount ? parseFloat(record.cost.amount) : 0;

        await supabase
          .from("sms_logs")
          .update({
            status: newStatus,
            cost_eur: costAmount,
            error_detail: eventType === "message.failed" ? JSON.stringify(record?.errors || []) : null,
            updated_at: new Date().toISOString(),
          })
          .eq("telnyx_message_id", telnyxMsgId);

        break;
      }

      // ── Inbound SMS ──
      case "message.received": {
        const fromNumber = record?.from?.phone_number;
        const toNumber = record?.to?.[0]?.phone_number || record?.to;
        const body = record?.text;
        const telnyxMsgId = record?.id;

        if (!fromNumber || !body) break;

        // Try to find company by the "to" number
        let companyId: string | null = null;
        if (toNumber) {
          const cleanTo = String(toNumber).replace(/[^0-9+]/g, "");
          const { data: phoneRecord } = await supabase
            .from("ai_agent_phone_numbers")
            .select("company_id")
            .or(`phone_number.eq.${cleanTo},phone_number.eq.${cleanTo.replace("+", "")}`)
            .limit(1)
            .maybeSingle();
          companyId = phoneRecord?.company_id || null;
        }

        // Try to find contact by phone
        let contactId: string | null = null;
        if (companyId) {
          const cleanFrom = fromNumber.replace(/[^0-9]/g, "");
          const { data: contact } = await supabase
            .from("marketing_contacts")
            .select("id")
            .eq("company_id", companyId)
            .or(`phone.ilike.%${cleanFrom.slice(-9)}%`)
            .limit(1)
            .maybeSingle();
          contactId = contact?.id || null;
        }

        // Save inbound SMS
        if (companyId) {
          await supabase.from("sms_logs").insert({
            company_id: companyId,
            contact_id: contactId,
            direction: "inbound",
            from_number: fromNumber,
            to_number: String(toNumber),
            body,
            status: "received",
            telnyx_message_id: telnyxMsgId || null,
          });
        }

        break;
      }

      // ── Call events (for logging) ──
      case "call.initiated":
      case "call.answered":
      case "call.hangup": {
        console.log(`[telnyx-webhook] Call event ${eventType}:`, JSON.stringify(record?.call_control_id || ""));
        // Call events are primarily handled by ElevenLabs webhook
        // We just log them here for debugging
        break;
      }

      default:
        console.log(`[telnyx-webhook] Unhandled event: ${eventType}`);
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("telnyx-webhook error:", message);
    // Always return 200 to prevent Telnyx retries
    return new Response("OK", { status: 200, headers: corsHeaders });
  }
});
