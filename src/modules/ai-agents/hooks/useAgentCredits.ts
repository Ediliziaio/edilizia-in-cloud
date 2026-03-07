import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AgentCredits {
  id: string;
  total_minutes_purchased: number;
  minutes_used: number;
  cost_per_minute_platform: number;
  cost_per_minute_billed: number;
}

export function useAgentCredits() {
  return useQuery({
    queryKey: ["ai-agent-credits"],
    queryFn: async (): Promise<AgentCredits | null> => {
      const { data, error } = await supabase
        .from("ai_agent_credits" as never)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as unknown as AgentCredits | null;
    },
  });
}
