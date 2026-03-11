import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export interface InternalCallLog {
  id: string;
  agent_id: string;
  company_id: string;
  contact_id: string | null;
  contact_name: string | null;
  caller_phone: string | null;
  call_direction: string;
  status: string;
  outcome: string | null;
  duration_seconds: number;
  messages_count: number;
  summary: string | null;
  transcript: any;
  metadata: any;
  elevenlabs_conversation_id: string | null;
  campaign_id: string | null;
  started_at: string;
  agent?: { name: string };
}

export interface InternalAgentAction {
  id: string;
  call_id: string;
  company_id: string;
  tool_name: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  input_params: any;
  result: any;
  status: string;
  error_message: string | null;
  executed_at: string;
}

export function useInternalCallLogs(companyId?: string) {
  return useQuery({
    queryKey: queryKeys.internalCallLogs.list(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_call_logs")
        .select("*, agent:internal_ai_agents(name)")
        .eq("company_id", companyId!)
        .order("started_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as InternalCallLog[];
    },
  });
}

export function useInternalCallLog(id?: string) {
  return useQuery({
    queryKey: ["internal-call-log", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_call_logs")
        .select("*, agent:internal_ai_agents(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as InternalCallLog;
    },
  });
}

export function useInternalCallActions(callId?: string) {
  return useQuery({
    queryKey: ["internal-call-actions", callId],
    enabled: !!callId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_agent_actions")
        .select("*")
        .eq("call_id", callId!)
        .order("executed_at", { ascending: true });
      if (error) throw error;
      return data as unknown as InternalAgentAction[];
    },
  });
}
