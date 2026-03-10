import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export function useMarketingContacts(companyId: string | undefined) {
  return useQuery({
    queryKey: ["marketing-contacts-minimal", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAppointments(companyId: string | undefined) {
  return useQuery({
    queryKey: ["appointments-minimal", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, title, appointment_date, appointment_time, status, contact_id")
        .eq("company_id", companyId!)
        .order("appointment_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

interface ConversationRecord {
  id: string;
  agent_id: string;
  company_id: string;
  duration_seconds: number;
  messages_count: number;
  status: string;
  started_at: string;
}

export function useConversationsForContact(contactId: string | undefined) {
  return useQuery({
    queryKey: ["ai-conversations-contact", contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<ConversationRecord[]> => {
      const { data, error } = await supabase
        .from("ai_agent_conversations" as never)
        .select("*")
        .eq("contact_id", contactId!)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
