import { supabase } from "@/integrations/supabase/client";

/**
 * Sync post-conversation data with EdiliziaInCloud CRM.
 * This will be called from the elevenlabs-webhook edge function.
 * Client-side stub for future integration.
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
