import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FlowExecutionRun {
  id: string;
  flow_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  nodes_executed: number;
  error_message: string | null;
  trigger_type: string | null;
}

export function useFlowExecutions(flowId: string | null | undefined, limit = 5) {
  return useQuery({
    queryKey: ["flow-execution-runs", flowId, limit],
    queryFn: async () => {
      if (!flowId) return [];
      const { data, error } = await supabase
        .from("flow_execution_runs")
        .select("id, flow_id, status, started_at, ended_at, duration_ms, nodes_executed, error_message, trigger_type")
        .eq("flow_id", flowId)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as FlowExecutionRun[];
    },
    enabled: !!flowId,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
}

export function useLatestFlowExecution(flowId: string | null | undefined) {
  const { data, ...rest } = useFlowExecutions(flowId, 1);
  return { data: data?.[0] ?? null, ...rest };
}
