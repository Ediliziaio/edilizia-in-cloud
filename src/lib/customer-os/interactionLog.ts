/**
 * interactionLog — helper per scrivere su `customer_interactions` (omnichannel).
 *
 * NB: INSERT da client funziona solo se l'utente fa parte della company.
 * In contesto admin/agent server-side, usare service_role (edge function).
 *
 * Usato da:
 *   - Email client azienda (quando si manda email outbound)
 *   - Chat in-app (ogni messaggio)
 *   - WhatsApp webhook (edge function)
 *   - Ticket creation/reply
 */
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

export type InteractionChannel =
  | "email_inbound"
  | "email_outbound"
  | "chat_inbound"
  | "chat_outbound"
  | "whatsapp_inbound"
  | "whatsapp_outbound"
  | "phone_call_inbound"
  | "phone_call_outbound"
  | "ticket_created"
  | "ticket_replied"
  | "ticket_resolved"
  | "nps_submitted"
  | "demo_completed"
  | "in_app_chat_inbound"
  | "in_app_chat_outbound";

export interface LogInteractionInput {
  companyId: string;
  channel: InteractionChannel;
  subject?: string;
  body?: string;
  contactUserId?: string;
  staffUserId?: string;
  aiPersonaKey?: string;
  externalThreadId?: string;
  externalMessageId?: string;
  relatedTicketId?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

function deriveDirection(channel: InteractionChannel): "inbound" | "outbound" {
  if (channel.endsWith("_inbound")) return "inbound";
  if (channel.endsWith("_outbound")) return "outbound";
  if (channel === "ticket_created" || channel === "nps_submitted") return "inbound";
  return "outbound";  // ticket_replied, ticket_resolved, demo_completed
}

/** Logga un'interazione omnichannel. Fire-and-forget. */
export async function logInteraction(input: LogInteractionInput): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sp = supabase as any;
    const { data, error } = await sp
      .from("customer_interactions")
      .insert({
        company_id: input.companyId,
        channel: input.channel,
        direction: deriveDirection(input.channel),
        contact_user_id: input.contactUserId ?? null,
        staff_user_id: input.staffUserId ?? null,
        ai_persona_key: input.aiPersonaKey ?? null,
        subject: input.subject ?? null,
        body: input.body ?? null,
        external_thread_id: input.externalThreadId ?? null,
        external_message_id: input.externalMessageId ?? null,
        related_ticket_id: input.relatedTicketId ?? null,
        metadata: input.metadata ?? {},
        occurred_at: (input.occurredAt ?? new Date()).toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      logger.warn("[interactionLog] failed:", error.message);
      return null;
    }
    return (data?.id as string) ?? null;
  } catch (err) {
    logger.warn("[interactionLog] threw:", (err as Error).message);
    return null;
  }
}

/** Fetch ultime N interazioni per un cliente, opzionalmente filtrate per canale. */
export async function listRecentInteractions(
  companyId: string,
  options: { limit?: number; channels?: InteractionChannel[] } = {},
): Promise<Array<{
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  sentiment: string | null;
  ai_persona_key: string | null;
  occurred_at: string;
}>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sp = supabase as any;
  let q = sp
    .from("customer_interactions")
    .select("id, channel, direction, subject, body, sentiment, ai_persona_key, occurred_at")
    .eq("company_id", companyId);
  if (options.channels?.length) q = q.in("channel", options.channels);
  q = q.order("occurred_at", { ascending: false }).limit(options.limit ?? 20);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
