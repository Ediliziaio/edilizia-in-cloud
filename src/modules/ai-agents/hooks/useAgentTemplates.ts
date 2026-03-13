import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AgentTemplate {
  id: string;
  name: string;
  description: string | null;
  categoria: string;
  icona: string;
  system_prompt: string;
  first_message: string;
  agent_type: string;
  objective: string | null;
  suggested_voice: string | null;
  sort_order: number;
}

export function useAgentTemplates() {
  return useQuery({
    queryKey: ["ai-agent-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agent_templates")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as AgentTemplate[];
    },
    staleTime: 1000 * 60 * 10,
  });
}
