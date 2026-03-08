import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AgentBranch {
  id: string;
  agent_id: string;
  company_id: string;
  name: string;
  traffic_percent: number;
  is_main: boolean;
  system_prompt: string | null;
  first_message: string | null;
  voice_id: string | null;
  llm_model: string | null;
  conversations_count: number;
  appointments_count: number;
  avg_duration_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface BranchInsert {
  agent_id: string;
  company_id: string;
  name: string;
  traffic_percent?: number;
  is_main?: boolean;
  system_prompt?: string | null;
  first_message?: string | null;
  voice_id?: string | null;
  llm_model?: string | null;
}

export interface BranchUpdate {
  name?: string;
  traffic_percent?: number;
  system_prompt?: string | null;
  first_message?: string | null;
  voice_id?: string | null;
  llm_model?: string | null;
}

const QUERY_KEY = "ai-agent-branches";

export function useAgentBranches(agentId?: string) {
  return useQuery({
    queryKey: [QUERY_KEY, agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agent_branches" as any)
        .select("*")
        .eq("agent_id", agentId!)
        .order("is_main", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AgentBranch[];
    },
  });
}

export function useCreateBranch(agentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BranchInsert) => {
      const { data, error } = await supabase
        .from("ai_agent_branches" as any)
        .insert(input as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as AgentBranch;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, agentId] });
      toast.success("Variante creata");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateBranch(agentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...update }: BranchUpdate & { id: string }) => {
      const { error } = await supabase
        .from("ai_agent_branches" as any)
        .update({ ...update, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY, agentId] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateTrafficSplit(agentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (splits: { id: string; traffic_percent: number }[]) => {
      for (const s of splits) {
        const { error } = await supabase
          .from("ai_agent_branches" as any)
          .update({ traffic_percent: s.traffic_percent, updated_at: new Date().toISOString() } as any)
          .eq("id", s.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, agentId] });
      toast.success("Divisione traffico salvata");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteBranch(agentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_agent_branches" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, agentId] });
      toast.success("Variante eliminata");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
