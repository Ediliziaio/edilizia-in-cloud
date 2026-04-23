// MP01 — Router webhook WhatsApp multi-numero.
// Entry: payload JSON Meta già parsato.
// 1. Gestisce delivery statuses aggiornando messaging_messages /
//    whatsapp_broadcast_recipients (invariato da pre-MP01).
// 2. Per ogni messaggio inbound, fa lookup su ai_whatsapp_numbers
//    (by phone_number_id) e delega all'handler corretto in base a purpose.
// 3. Errori di lookup → wa_routing_errors, mai 4xx a Meta.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  IncomingWhatsAppMessage,
  InboundContext,
  Purpose,
  WANumber,
} from "./types.ts";
import { extractMessageContent } from "./parser.ts";
import { logRoutingError } from "./errors.ts";
import { handleBotOperativo } from "./handlers/bot_operativo.ts";
import { handleAssistenza } from "./handlers/assistenza.ts";
import { handleLead } from "./handlers/lead.ts";
import { handleMarketing } from "./handlers/marketing.ts";
import { handleNotifiche } from "./handlers/notifiche.ts";

interface MetaStatus {
  id: string;
  status: string;
  timestamp: string;
}

interface MetaValue {
  metadata?: { phone_number_id?: string };
  messages?: IncomingWhatsAppMessage[];
  statuses?: MetaStatus[];
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
}

interface MetaEntry {
  changes?: Array<{ field?: string; value?: MetaValue }>;
}

interface MetaPayload {
  entry?: MetaEntry[];
}

export async function routeIncoming(
  supabase: SupabaseClient,
  payload: MetaPayload,
): Promise<void> {
  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    const changes = entry.changes ?? [];
    for (const change of changes) {
      if (change.field !== "messages") continue;
      const value = change.value ?? {};

      // ── Delivery status updates ────────────────────────────────────────
      const statuses = value.statuses ?? [];
      for (const status of statuses) {
        await handleDeliveryStatus(supabase, status);
      }

      const messages = value.messages ?? [];
      if (messages.length === 0) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // ── Lookup numero destinatario ─────────────────────────────────────
      const { data: waNumber, error: waErr } = await supabase
        .from("ai_whatsapp_numbers")
        .select("id, company_id, purpose, agent_id, stato, display_name")
        .eq("phone_number_id", phoneNumberId)
        .is("deleted_at", null)
        .maybeSingle();

      if (waErr || !waNumber) {
        await logRoutingError(supabase, {
          error_kind: "unknown_phone_number_id",
          phone_number_id: phoneNumberId,
          wa_message_id: messages[0]?.id ?? null,
          error_detail:
            waErr?.message ?? "nessun ai_whatsapp_numbers con questo phone_number_id",
        });
        continue;
      }

      if (waNumber.stato && waNumber.stato !== "active") {
        await logRoutingError(supabase, {
          error_kind: "company_disabled",
          phone_number_id: phoneNumberId,
          wa_message_id: messages[0]?.id ?? null,
          error_detail: `numero stato=${waNumber.stato}`,
        });
        continue;
      }

      // Mappa contatti → nome per populazione senderName
      const contactMap: Record<string, string> = {};
      for (const c of value.contacts ?? []) {
        if (c.wa_id) contactMap[c.wa_id] = c.profile?.name ?? c.wa_id;
      }

      // ── Dispatch messaggi ──────────────────────────────────────────────
      for (const msg of messages) {
        const extracted = extractMessageContent(msg);
        const senderPhone = msg.from;
        const senderName = contactMap[senderPhone] ?? senderPhone;

        const ctx: InboundContext = {
          waNumber: waNumber as WANumber,
          phoneNumberId,
          msg,
          extracted,
          senderPhone,
          senderName,
        };

        try {
          await dispatchByPurpose(supabase, ctx);
        } catch (err) {
          console.error(
            JSON.stringify({
              level: "error",
              fn: "router",
              msg: "handler threw",
              purpose: waNumber.purpose,
              wa_message_id: msg.id ?? null,
              error: String(err),
            }),
          );
          await logRoutingError(supabase, {
            error_kind: "payload_malformed",
            phone_number_id: phoneNumberId,
            wa_message_id: msg.id ?? null,
            error_detail: String(err),
          });
        }
      }
    }
  }
}

async function dispatchByPurpose(
  supabase: SupabaseClient,
  ctx: InboundContext,
): Promise<void> {
  const purpose = ctx.waNumber.purpose as Purpose;
  switch (purpose) {
    case "bot_operativo":
      return handleBotOperativo(supabase, ctx);
    case "assistenza":
      return handleAssistenza(supabase, ctx);
    case "lead":
      return handleLead(supabase, ctx);
    case "marketing":
      return handleMarketing(supabase, ctx);
    case "notifiche":
      return handleNotifiche(supabase, ctx);
    default: {
      const never: never = purpose;
      throw new Error(`Purpose non gestito: ${String(never)}`);
    }
  }
}

async function handleDeliveryStatus(
  supabase: SupabaseClient,
  status: MetaStatus,
): Promise<void> {
  const { id: metaMessageId, status: newStatus, timestamp } = status;
  if (!metaMessageId || !newStatus || !timestamp) return;

  const isoTs = new Date(parseInt(timestamp, 10) * 1000).toISOString();
  const updateData: Record<string, string> = { delivery_status: newStatus };
  if (newStatus === "delivered") updateData.delivered_at = isoTs;
  if (newStatus === "read") {
    updateData.delivered_at = updateData.delivered_at ?? isoTs;
    updateData.read_at = isoTs;
  }

  await supabase
    .from("messaging_messages")
    .update(updateData)
    .eq("meta_message_id", metaMessageId);

  const broadcastUpdate: Record<string, string> = { status: newStatus };
  if (newStatus === "delivered") broadcastUpdate.delivered_at = isoTs;
  if (newStatus === "read") broadcastUpdate.read_at = isoTs;

  await supabase
    .from("whatsapp_broadcast_recipients")
    .update(broadcastUpdate)
    .eq("meta_message_id", metaMessageId);
}
