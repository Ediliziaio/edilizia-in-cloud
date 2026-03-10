import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { callElevenLabsProxy } from "./useElevenLabsProxy";
import type { AIAgent, AIAgentInsert, AIAgentUpdate } from "../types/agent.types";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { queryKeys } from "@/lib/queryKeys";

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.aiAgents.list(),
    queryFn: async (): Promise<AIAgent[]> => {
      const { data, error } = await supabase
        .from("ai_agents" as never)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as AIAgent[];
    },
  });
}

export function useAgent(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.aiAgents.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<AIAgent> => {
      const { data, error } = await supabase
        .from("ai_agents" as never)
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as unknown as AIAgent;
    },
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (input: AIAgentInsert) => {
      const result = await callElevenLabsProxy<{ agent_id: string; elevenlabs_agent_id: string }>({
        action: "create_agent",
        payload: {
          name: input.name,
          system_prompt: input.system_prompt || "",
          first_message: input.first_message || "",
          llm_model: input.llm_model || "gemini-2.5-flash",
          language: input.language || "it",
          objective: input.objective || "",
          website_url: input.website_url || "",
        },
      });

      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiAgents.all });
      toast.success("Agente creato con successo");
      navigate(`/azienda/marketing/agente-ai/${data.agent_id}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore nella creazione dell'agente");
    },
  });
}

export function useUpdateAgent(id: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (update: AIAgentUpdate) => {
      if (!id) throw new Error("ID agente mancante");

      const { data: agent, error: fetchErr } = await supabase
        .from("ai_agents" as never)
        .select("elevenlabs_agent_id")
        .eq("id", id)
        .single();

      if (fetchErr) throw fetchErr;

      const elAgentId = (agent as unknown as AIAgent).elevenlabs_agent_id;

      if (elAgentId) {
        await callElevenLabsProxy({
          action: "update_agent",
          agent_id: elAgentId,
          payload: update as Record<string, unknown>,
        });
      }

      const { error } = await supabase
        .from("ai_agents" as never)
        .update({ ...update, updated_at: new Date().toISOString() } as never)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiAgents.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.aiAgents.all });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore nel salvataggio");
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Get elevenlabs_agent_id before deleting
      const { data: agent } = await supabase
        .from("ai_agents" as never)
        .select("elevenlabs_agent_id")
        .eq("id", id)
        .single();

      const elAgentId = (agent as unknown as AIAgent | null)?.elevenlabs_agent_id;

      // Delete locally FIRST to preserve data integrity
      const { error } = await supabase.from("ai_agents" as never).delete().eq("id", id);
      if (error) throw error;

      // Then delete on ElevenLabs (best-effort)
      if (elAgentId) {
        try {
          await callElevenLabsProxy({
            action: "delete_agent",
            agent_id: elAgentId,
          });
        } catch (e) {
          console.warn("ElevenLabs delete failed (orphan may remain on provider):", e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiAgents.all });
      toast.success("Agente eliminato");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore nell'eliminazione");
    },
  });
}
