import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side utilities for reading CRM data from the AI Agents module.
 * Write operations (create appointment, create contact, decrement credits)
 * are handled server-side in the elevenlabs-webhook edge function.
 */

export async function syncConversationToCRM(params: {
  conversationId: string;
  agentId: string;
  companyId: string;
  contactId?: string;
  appointmentCreated?: boolean;
  durationSeconds: number;
  messagesCount: number;
}) {
  const { error } = await supabase
    .from("ai_agent_conversations" as never)
    .insert({
      agent_id: params.agentId,
      company_id: params.companyId,
      elevenlabs_conversation_id: params.conversationId,
      contact_id: params.contactId || null,
      appointment_created: params.appointmentCreated || false,
      duration_seconds: params.durationSeconds,
      messages_count: params.messagesCount,
      status: "completed",
    } as never);

  if (error) throw error;
}

export async function decrementCredits(companyId: string, minutesUsed: number) {
  const { data, error: fetchErr } = await supabase
    .from("ai_agent_credits" as never)
    .select("minutes_used")
    .eq("company_id", companyId)
    .single();

  if (fetchErr) throw fetchErr;
  const current = (data as { minutes_used: number } | null)?.minutes_used ?? 0;

  const { error } = await supabase
    .from("ai_agent_credits" as never)
    .update({ minutes_used: current + minutesUsed, updated_at: new Date().toISOString() } as never)
    .eq("company_id", companyId);

  if (error) throw error;
}

/** Get conversations linked to a specific contact */
export async function getConversationsForContact(contactId: string) {
  const { data, error } = await supabase
    .from("ai_agent_conversations" as never)
    .select("*")
    .eq("contact_id", contactId)
    .order("started_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Get agent usage stats for a company */
export async function getAgentUsageStats(companyId: string) {
  const { data, error } = await supabase
    .from("ai_agent_conversations" as never)
    .select("agent_id, duration_seconds")
    .eq("company_id", companyId);

  if (error) throw error;

  const grouped = new Map<string, { totalSeconds: number; count: number }>();
  for (const conv of (data as { agent_id: string; duration_seconds: number }[] ?? [])) {
    const existing = grouped.get(conv.agent_id) || { totalSeconds: 0, count: 0 };
    existing.totalSeconds += conv.duration_seconds;
    existing.count += 1;
    grouped.set(conv.agent_id, existing);
  }

  return grouped;
}
