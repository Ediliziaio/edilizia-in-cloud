import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders as baseCorsHeaders } from "../_shared/headers.ts";

const corsHeaders = {
  ...baseCorsHeaders,
  "Access-Control-Allow-Headers": baseCorsHeaders["Access-Control-Allow-Headers"] + ", telnyx-signature-ed25519, telnyx-timestamp",
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

      // ── Inbound Call Routing (Smart Routing) ──
      case "call.initiated": {
        const direction = record?.direction;
        const callControlId = record?.call_control_id;
        const callLegId = record?.call_leg_id;
        const toNumber = record?.to;
        const fromNumber = record?.from;

        console.log(`[telnyx-webhook] call.initiated direction=${direction} callControlId=${callControlId}`);

        // Only handle incoming calls
        if (direction !== "incoming" || !callControlId) break;

        const cleanTo = String(toNumber).replace(/[^0-9+]/g, "");

        // Lookup agent phone number (includes routing_mode and internal_agent_id)
        const { data: phoneRec } = await supabase
          .from("ai_agent_phone_numbers")
          .select("id, agent_id, internal_agent_id, company_id, elevenlabs_phone_number_id, telnyx_connection_id, routing_mode")
          .or(`phone_number.eq.${cleanTo},phone_number.eq.${cleanTo.replace("+", "")}`)
          .limit(1)
          .maybeSingle();

        if (!phoneRec) {
          console.log(`[telnyx-webhook] No agent phone found for ${cleanTo}, ignoring`);
          break;
        }

        // ── Smart Routing: resolve the correct agent ──
        const routingMode = phoneRec.routing_mode || "marketing";
        const resolved = await resolveAgent(supabase, phoneRec, routingMode);

        if (!resolved) {
          console.log(`[telnyx-webhook] No agent resolved for routing_mode=${routingMode}, rejecting`);
          await telnyxCallControl(callControlId, "reject", { cause: "CALL_REJECTED" });
          break;
        }

        console.log(`[telnyx-webhook] Resolved agent: type=${resolved.type}, elAgentId=${resolved.elevenlabsAgentId}`);

        // Credit check (shared wallet)
        const { data: credits } = await supabase
          .from("ai_credits")
          .select("balance_eur, calls_blocked")
          .eq("company_id", phoneRec.company_id)
          .maybeSingle();

        const balance = credits?.balance_eur || 0;
        if (credits?.calls_blocked || balance < 0.04) {
          console.log(`[telnyx-webhook] Insufficient credits for company ${phoneRec.company_id}, rejecting`);
          await telnyxCallControl(callControlId, "reject", { cause: "CALL_REJECTED" });
          break;
        }

        // ── Contact Lookup ──
        let contactId: string | null = null;
        if (fromNumber) {
          const cleanFrom = String(fromNumber).replace(/[^0-9]/g, "");
          const { data: contact } = await supabase
            .from("marketing_contacts")
            .select("id")
            .eq("company_id", phoneRec.company_id)
            .or(`phone.ilike.%${cleanFrom.slice(-9)}%`)
            .limit(1)
            .maybeSingle();
          contactId = contact?.id || null;
        }

        const callMeta = {
          telnyx_call_control_id: callControlId,
          telnyx_call_leg_id: callLegId,
          from_number: fromNumber,
          to_number: toNumber,
          routing_mode: routingMode,
          agent_type: resolved.type,
        };

        if (phoneRec.elevenlabs_phone_number_id) {
          // ElevenLabs handles routing via SIP — just log
          console.log(`[telnyx-webhook] Number linked to ElevenLabs, EL handles routing`);

          if (resolved.type === "internal") {
            await supabase.from("internal_call_logs").insert({
              agent_id: resolved.agentId,
              company_id: phoneRec.company_id,
              contact_id: contactId,
              call_direction: "inbound",
              status: "ringing",
              caller_phone: fromNumber || null,
              metadata: callMeta,
            });
          } else {
            await supabase.from("ai_agent_conversations").insert({
              agent_id: resolved.agentId,
              company_id: phoneRec.company_id,
              contact_id: contactId,
              call_direction: "inbound",
              status: "ringing",
              metadata: callMeta,
            });
          }
        } else {
          // Manual SIP transfer: answer → transfer to ElevenLabs SIP
          console.log(`[telnyx-webhook] No EL phone link, attempting answer + SIP transfer`);

          await telnyxCallControl(callControlId, "answer", {});
          await new Promise((r) => setTimeout(r, 500));

          const sipUri = `sip:${resolved.elevenlabsAgentId}@sip.elevenlabs.io`;
          await telnyxCallControl(callControlId, "transfer", {
            to: sipUri,
            sip_headers: [
              { name: "X-ElevenLabs-Agent-Id", value: resolved.elevenlabsAgentId },
            ],
          });

          const activeMeta = { ...callMeta, sip_transfer_to: sipUri };

          if (resolved.type === "internal") {
            await supabase.from("internal_call_logs").insert({
              agent_id: resolved.agentId,
              company_id: phoneRec.company_id,
              contact_id: contactId,
              call_direction: "inbound",
              status: "active",
              caller_phone: fromNumber || null,
              metadata: activeMeta,
            });
          } else {
            await supabase.from("ai_agent_conversations").insert({
              agent_id: resolved.agentId,
              company_id: phoneRec.company_id,
              contact_id: contactId,
              call_direction: "inbound",
              status: "active",
              metadata: activeMeta,
            });
          }
        }

        break;
      }

      // ── Other Call events (logging) ──
      case "call.answered":
      case "call.hangup": {
        console.log(`[telnyx-webhook] Call event ${eventType}:`, JSON.stringify(record?.call_control_id || ""));
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

// ── Telnyx Call Control API helper ──
async function telnyxCallControl(callControlId: string, command: string, params: Record<string, unknown>) {
  // Get Telnyx API key from telnyx_settings (first available)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: settings } = await supabase
    .from("telnyx_settings")
    .select("api_key_encrypted")
    .limit(1)
    .maybeSingle();

  if (!settings?.api_key_encrypted) {
    console.error("[telnyx-webhook] No Telnyx API key found in settings");
    return;
  }

  // The api_key_encrypted may be plain or encrypted; try to use it directly
  const apiKey = settings.api_key_encrypted;

  const url = `https://api.telnyx.com/v2/calls/${callControlId}/actions/${command}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[telnyx-webhook] Call control ${command} failed: ${res.status} ${body}`);
  } else {
    console.log(`[telnyx-webhook] Call control ${command} success`);
  }
}

// ── Smart Routing: resolve agent by routing_mode ──
interface ResolvedAgent {
  type: "marketing" | "internal";
  agentId: string;
  elevenlabsAgentId: string;
  companyId: string;
}

async function resolveAgent(
  supabase: ReturnType<typeof createClient>,
  phoneRec: { agent_id: string; internal_agent_id: string | null; company_id: string; routing_mode: string },
  routingMode: string
): Promise<ResolvedAgent | null> {
  if (routingMode === "internal" && phoneRec.internal_agent_id) {
    // Lookup internal agent
    const { data: internalAgent } = await supabase
      .from("internal_ai_agents")
      .select("id, elevenlabs_agent_id, status")
      .eq("id", phoneRec.internal_agent_id)
      .single();

    if (internalAgent?.elevenlabs_agent_id && internalAgent.status !== "archived") {
      return {
        type: "internal",
        agentId: internalAgent.id,
        elevenlabsAgentId: internalAgent.elevenlabs_agent_id,
        companyId: phoneRec.company_id,
      };
    }

    console.warn(`[telnyx-webhook] Internal agent ${phoneRec.internal_agent_id} not ready, falling back to marketing`);
  }

  // Default: marketing agent
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("id, elevenlabs_agent_id, status")
    .eq("id", phoneRec.agent_id)
    .single();

  if (!agent?.elevenlabs_agent_id) {
    return null;
  }

  return {
    type: "marketing",
    agentId: agent.id,
    elevenlabsAgentId: agent.elevenlabs_agent_id,
    companyId: phoneRec.company_id,
  };
}
