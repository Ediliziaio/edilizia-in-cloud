import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders as baseCorsHeaders } from "../_shared/headers.ts";
import { sanitizePhoneForQuery } from "../_shared/webhookSecurity.ts";

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
    // Leggi body prima della verifica firma
    const rawBody = await req.text();

    // Verifica firma Ed25519 Telnyx (SEC-012)
    const sigEd25519 = req.headers.get("telnyx-signature-ed25519");
    const telnyxTimestamp = req.headers.get("telnyx-timestamp");
    const telnyxPublicKey = Deno.env.get("TELNYX_PUBLIC_KEY");

    // SICUREZZA: rifiutiamo SEMPRE se TELNYX_PUBLIC_KEY non è settato.
    if (!telnyxPublicKey) {
      console.error("telnyx-webhook: TELNYX_PUBLIC_KEY non configurata — reject all");
      return new Response("Webhook public key not configured on server", { status: 503 });
    }
    if (!sigEd25519 || !telnyxTimestamp) {
      console.error("telnyx-webhook: intestazioni firma mancanti");
      return new Response("Unauthorized", { status: 401 });
    }
    // Prevenzione replay attack: rifiuta se timestamp > 5 minuti
    const tsSeconds = parseInt(telnyxTimestamp, 10);
    if (isNaN(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
      console.error("telnyx-webhook: timestamp non valido o replay attack");
      return new Response("Unauthorized", { status: 401 });
    }
    // Payload firmato da Telnyx: "timestamp|rawBody"
    const msgBuffer = new TextEncoder().encode(`${telnyxTimestamp}|${rawBody}`);
    const pubKeyBuffer = Uint8Array.from(atob(telnyxPublicKey), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      pubKeyBuffer,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const sigBuffer = Uint8Array.from(atob(sigEd25519), (c) => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify("Ed25519", cryptoKey, sigBuffer, msgBuffer);
    if (!isValid) {
      console.error("telnyx-webhook: firma Ed25519 non valida");
      return new Response("Unauthorized", { status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

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

        // Aggiorna sms_logs (automazioni/AI)
        await supabase
          .from("sms_logs")
          .update({
            status: newStatus,
            cost_eur: costAmount,
            error_detail: eventType === "message.failed" ? JSON.stringify(record?.errors || []) : null,
            updated_at: new Date().toISOString(),
          })
          .eq("telnyx_message_id", telnyxMsgId);

        // 2026-06-11 FIX: le CAMPAGNE marketing loggano su sms_log (colonne
        // italiane) — prima il webhook non la toccava e le consegne delle
        // campagne non si aggiornavano MAI (restavano "inviato" per sempre).
        const statoItaliano: Record<string, string> = {
          sent: "inviato",
          delivered: "consegnato",
          failed: "fallito",
        };
        const campagnaUpdate: Record<string, unknown> = {
          stato: statoItaliano[newStatus] ?? newStatus,
        };
        if (newStatus === "delivered") campagnaUpdate.consegnato_at = new Date().toISOString();
        if (newStatus === "failed") {
          campagnaUpdate.errore_dettaglio = JSON.stringify(record?.errors || []).slice(0, 500);
        }
        await supabase
          .from("sms_log")
          .update(campagnaUpdate)
          .eq("telnyx_message_id", telnyxMsgId);

        // Aggiorna sms_messages (SMS transazionali)
        const updateFields: Record<string, unknown> = { status: newStatus };
        if (newStatus === "delivered") updateFields.delivered_at = new Date().toISOString();
        if (newStatus === "failed") {
          updateFields.error_message = JSON.stringify(record?.errors || []).slice(0, 500);
        }
        await supabase
          .from("sms_messages")
          .update(updateFields)
          .eq("telnyx_id", telnyxMsgId);

        break;
      }

      // ── Inbound SMS ──
      case "message.received": {
        const fromNumber = record?.from?.phone_number;
        const toNumber = record?.to?.[0]?.phone_number || record?.to;
        const body = record?.text;
        const telnyxMsgId = record?.id;

        if (!fromNumber || !body) break;

        // P2-2: sanitize phone via helper e `.in()`/`.ilike()` senza
        // interpolazione raw nel DSL PostgREST.
        // 2026-06-11 FIX: prima il lookup guardava SOLO i numeri degli
        // agenti vocali AI (ai_agent_phone_numbers) — gli SMS in arrivo
        // sui numeri comprati col MODULO SMS (sms_telnyx_numbers) venivano
        // scartati in silenzio. Ora si cercano entrambe le tabelle.
        let companyId: string | null = null;
        if (toNumber) {
          const safeTo = sanitizePhoneForQuery(toNumber);
          if (safeTo) {
            const digits = safeTo.replace(/\+/g, "");
            const { data: phoneRecord } = await supabase
              .from("ai_agent_phone_numbers")
              .select("company_id")
              .in("phone_number", [safeTo, digits])
              .limit(1)
              .maybeSingle();
            companyId = phoneRecord?.company_id || null;

            if (!companyId) {
              const { data: smsNumber } = await supabase
                .from("sms_telnyx_numbers")
                .select("company_id")
                .in("numero_e164", [safeTo, `+${digits}`])
                .eq("stato", "attivo")
                .limit(1)
                .maybeSingle();
              companyId = smsNumber?.company_id || null;
            }
          }
        }

        // Try to find contact by phone (substring match safe: digitsOnly)
        let contactId: string | null = null;
        if (companyId) {
          const safeFrom = sanitizePhoneForQuery(fromNumber);
          if (safeFrom) {
            const suffix = safeFrom.replace(/\+/g, "").slice(-9);
            const { data: contact } = await supabase
              .from("marketing_contacts")
              .select("id")
              .eq("company_id", companyId)
              .ilike("phone", `%${suffix}%`)
              .limit(1)
              .maybeSingle();
            contactId = contact?.id || null;
          }
        }

        // Save inbound SMS in sms_logs (campagne) e sms_messages (transazionali)
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

          await supabase.from("sms_messages").insert({
            company_id: companyId,
            direction: "inbound",
            status: "received",
            from_number: fromNumber,
            to_number: String(toNumber),
            body,
            telnyx_id: telnyxMsgId || null,
            trigger_type: "api",
            received_at: new Date().toISOString(),
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

        // P2-2: sanitize phone via helper.
        const safeTo = sanitizePhoneForQuery(toNumber);
        if (!safeTo) {
          console.log(`[telnyx-webhook] to number non valido, ignore`);
          break;
        }
        const toDigits = safeTo.replace(/\+/g, "");

        // Lookup agent phone number (includes routing_mode and internal_agent_id)
        const { data: phoneRec } = await supabase
          .from("ai_agent_phone_numbers")
          .select("id, agent_id, internal_agent_id, company_id, elevenlabs_phone_number_id, telnyx_connection_id, routing_mode")
          .in("phone_number", [safeTo, toDigits])
          .limit(1)
          .maybeSingle();

        if (!phoneRec) {
          console.log(`[telnyx-webhook] No agent phone found for ${safeTo}, ignoring`);
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

        // ── Contact Lookup ── (P2-2: sanitize phone via helper)
        let contactId: string | null = null;
        if (fromNumber) {
          const safeFrom = sanitizePhoneForQuery(fromNumber);
          if (safeFrom) {
            const suffix = safeFrom.replace(/\+/g, "").slice(-9);
            const { data: contact } = await supabase
              .from("marketing_contacts")
              .select("id")
              .eq("company_id", phoneRec.company_id)
              .ilike("phone", `%${suffix}%`)
              .limit(1)
              .maybeSingle();
            contactId = contact?.id || null;
          }
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
      case "call.answered": {
        // Chiamata in entrata risposta: marca come 'active' le conversazioni in 'ringing'
        // aperte da call.initiated per questo call_control_id.
        const ccid = record?.call_control_id;
        if (ccid) {
          await supabase.from("ai_agent_conversations")
            .update({ status: "active" })
            .eq("metadata->>telnyx_call_control_id", ccid)
            .eq("status", "ringing");
          await supabase.from("internal_call_logs")
            .update({ status: "active" })
            .eq("metadata->>telnyx_call_control_id", ccid)
            .eq("status", "ringing");
        }
        console.log(`[telnyx-webhook] call.answered ccid=${ccid || ""}`);
        break;
      }

      case "call.hangup": {
        // Fine chiamata: chiude la conversazione aperta (ringing/active) per quel
        // call_control_id, registrando esito e durata. Prima questo evento era solo
        // loggato → le conversazioni in entrata restavano "aperte" all'infinito.
        const ccid = record?.call_control_id;
        if (ccid) {
          const cause = String(record?.hangup_cause || "");
          let durationSeconds = 0;
          const st = record?.start_time ? Date.parse(record.start_time) : NaN;
          const et = record?.end_time ? Date.parse(record.end_time) : NaN;
          if (!Number.isNaN(st) && !Number.isNaN(et) && et > st) {
            durationSeconds = Math.round((et - st) / 1000);
          }
          const noAnswerCauses = [
            "call_rejected", "user_busy", "no_answer", "originator_cancel",
            "no_user_response", "no_answer_timeout", "unallocated_number",
          ];
          const finalStatus = cause === "normal_clearing"
            ? "completed"
            : noAnswerCauses.includes(cause) ? "no_answer" : "failed";

          const patch = { status: finalStatus, duration_seconds: durationSeconds };
          await supabase.from("ai_agent_conversations")
            .update(patch)
            .eq("metadata->>telnyx_call_control_id", ccid)
            .in("status", ["ringing", "active"]);
          await supabase.from("internal_call_logs")
            .update(patch)
            .eq("metadata->>telnyx_call_control_id", ccid)
            .in("status", ["ringing", "active"]);

          console.log(`[telnyx-webhook] call.hangup ccid=${ccid} cause=${cause} status=${finalStatus} dur=${durationSeconds}s`);
        }
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
  // 2026-06-11 FIX: prima leggeva SOLO telnyx_settings.api_key_encrypted
  // ("may be plain or encrypted, try directly" — se cifrata falliva muto).
  // Ora: TELNYX_API_KEY env (configurata, verificata healthy) come primario,
  // telnyx_settings come fallback legacy.
  let apiKey = Deno.env.get("TELNYX_API_KEY") ?? "";

  if (!apiKey) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings } = await supabase
      .from("telnyx_settings")
      .select("api_key_encrypted")
      .limit(1)
      .maybeSingle();
    apiKey = settings?.api_key_encrypted ?? "";
  }

  if (!apiKey) {
    console.error("[telnyx-webhook] No Telnyx API key found (env or settings)");
    return;
  }

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
