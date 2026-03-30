import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useLiveCallCount(agentId: string) {
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    // Initial count
    const fetchCount = async () => {
      const { count } = await supabase
        .from("ai_agent_conversations" as never)
        .select("id", { count: "exact", head: true })
        .eq("agent_id" as never, agentId)
        .eq("status" as never, "in_progress");
      setLiveCount(count ?? 0);
    };

    fetchCount();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`live-calls-${agentId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "ai_agent_conversations",
          filter: `agent_id=eq.${agentId}`,
        },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentId]);

  return liveCount;
}
