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
import { lingueDelModello, statoDopoAvvisoMeta } from "./statoModello.ts";

interface MetaStatus {
  id: string;
  status: string;
  timestamp: string;
}

interface MetaTemplateStatusUpdate {
  // APPROVED | REJECTED | FLAGGED | PENDING_DELETION | PAUSED | DISABLED | REINSTATED | IN_APPEAL…
  event?: string;
  message_template_id?: string;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string;
}

interface MetaValue {
  metadata?: { phone_number_id?: string };
  messages?: IncomingWhatsAppMessage[];
  statuses?: MetaStatus[];
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
  // v8.6.74 — Campi extra per message_template_status_update
  event?: string;
  message_template_id?: string;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string;
}

interface MetaEntry {
  id?: string; // WABA id
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
    const wabaId = entry.id;
    const changes = entry.changes ?? [];
    for (const change of changes) {
      // v8.6.74 — Branch per template status updates (separato da messages).
      // Meta invia field = "message_template_status_update" per approvazioni,
      // rejection e pausing dei template. Lo logghiamo per analitica + futuro
      // sync DB (oggi i template vivono solo lato Meta, fetched on-demand).
      if (change.field === "message_template_status_update") {
        await handleTemplateStatusUpdate(supabase, wabaId, change.value as MetaTemplateStatusUpdate);
        continue;
      }
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
        .select("id, company_id, purpose, agent_id, stato, display_name, operational_settings")
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

/**
 * v8.6.74 — Handler per "message_template_status_update".
 *
 * Meta invia questo evento quando lo stato di un template message cambia
 * (approvazione richiesta dal cliente, rifiuto per policy, pausa per
 * performance, disabilitazione). Tracciamo l'evento per analitica e per
 * notificare il cliente nell'app.
 *
 * Field di interesse:
 *   - event: APPROVED | REJECTED | FLAGGED | PENDING_DELETION | PAUSED | DISABLED
 *   - message_template_id: ID univoco template
 *   - message_template_name: nome assegnato dal cliente
 *   - message_template_language: locale (es. it_IT, en_US)
 *   - reason: motivo del rejection (se presente)
 *
 * Comportamento attuale:
 *   - Logghiamo in wa_routing_errors come livello "info" per audit
 *   - Identifichiamo la company tramite WABA id (whatsapp_business_account_id
 *     su ai_whatsapp_numbers) → notify futuro
 *
 * TODO future: tabella whatsapp_templates dedicata + push notification al
 * cliente quando un template viene approvato/rifiutato.
 */
async function handleTemplateStatusUpdate(
  supabase: SupabaseClient,
  wabaId: string | undefined,
  value: MetaTemplateStatusUpdate | undefined,
): Promise<void> {
  if (!value) return;

  // Lookup company tramite WABA id (può corrispondere a uno o più numeri)
  let companyId: string | null = null;
  if (wabaId) {
    const { data } = await supabase
      .from("ai_whatsapp_numbers")
      .select("company_id")
      .eq("waba_id", wabaId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    companyId = data?.company_id ?? null;
  }

  console.log(
    JSON.stringify({
      level: "info",
      fn: "handleTemplateStatusUpdate",
      msg: "template status changed",
      waba_id: wabaId,
      company_id: companyId,
      template_id: value.message_template_id,
      template_name: value.message_template_name,
      language: value.message_template_language,
      event: value.event,
      reason: value.reason,
    }),
  );

  // Log evento in wa_routing_errors (canale "audit" non bloccante).
  // Riusiamo la tabella per non aggiungere schema in questa iterazione.
  try {
    await supabase.from("wa_routing_errors").insert({
      error_kind: "template_status_update",
      phone_number_id: null,
      wa_message_id: null,
      company_id: companyId,
      error_detail: JSON.stringify({
        event: value.event,
        template_id: value.message_template_id,
        template_name: value.message_template_name,
        language: value.message_template_language,
        reason: value.reason,
        waba_id: wabaId,
      }),
    });
  } catch (err) {
    // Best-effort: se la tabella non accetta il kind, ignoriamo
    console.warn(
      JSON.stringify({
        level: "warn",
        fn: "handleTemplateStatusUpdate",
        msg: "audit log insert failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  await aggiornaStatoModello(supabase, wabaId, value);
}

/**
 * 24/09/2026 — Lo stato del modello si aggiorna da solo: approvato, rifiutato,
 * in pausa, disattivato. Automazioni, broadcast e chat leggono
 * wa_meta_templates, che prima restava «in attesa» fino alla sincronizzazione
 * ogni 6 ore. Mai un errore verso Meta: si scrive nel log e si va avanti.
 */
async function aggiornaStatoModello(
  supabase: SupabaseClient,
  wabaId: string | undefined,
  value: MetaTemplateStatusUpdate,
): Promise<void> {
  const stato = statoDopoAvvisoMeta(value.event);
  const nome = value.message_template_name;
  const lingue = lingueDelModello(value.message_template_language);
  if (!wabaId || !stato || !nome) return;
  try {
    const { data: numeri } = await supabase
      .from("ai_whatsapp_numbers")
      .select("id")
      .eq("waba_id", wabaId)
      .is("deleted_at", null);
    const idNumeri = (numeri ?? []).map((n: { id: string }) => n.id);
    if (idNumeri.length === 0) return;

    let aggiornamento = supabase
      .from("wa_meta_templates")
      .update({ status: stato, synced_at: new Date().toISOString() })
      .in("wa_number_id", idNumeri)
      .eq("template_name", nome);
    if (lingue.length > 0) aggiornamento = aggiornamento.in("template_language", lingue);
    const { data: righe, error } = await aggiornamento.select("id");

    console.log(
      JSON.stringify({
        level: error ? "warn" : "info",
        fn: "handleTemplateStatusUpdate",
        msg: "stato modello aggiornato",
        waba_id: wabaId,
        template_name: nome,
        stato,
        righe: righe?.length ?? 0,
        error: error?.message ?? null,
      }),
    );
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        fn: "handleTemplateStatusUpdate",
        msg: "stato modello non aggiornato",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
