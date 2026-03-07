import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { callElevenLabsProxy } from "./useElevenLabsProxy";
import type { AIAgent, AIAgentInsert, AIAgentUpdate } from "../types/agent.types";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export function useAgents() {
  return useQuery({
    queryKey: ["ai-agents"],
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
    queryKey: ["ai-agents", id],
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
      // 1. Call ElevenLabs proxy to create agent
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
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
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

      // Get current agent to find elevenlabs_agent_id
      const { data: agent, error: fetchErr } = await supabase
        .from("ai_agents" as never)
        .select("elevenlabs_agent_id")
        .eq("id", id)
        .single();

      if (fetchErr) throw fetchErr;

      const elAgentId = (agent as unknown as AIAgent).elevenlabs_agent_id;

      // Update on ElevenLabs if connected
      if (elAgentId) {
        await callElevenLabsProxy({
          action: "update_agent",
          agent_id: elAgentId,
          payload: update as Record<string, unknown>,
        });
      }

      // Update locally
      const { error } = await supabase
        .from("ai_agents" as never)
        .update({ ...update, updated_at: new Date().toISOString() } as never)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents", id] });
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
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
      const { data: agent } = await supabase
        .from("ai_agents" as never)
        .select("elevenlabs_agent_id")
        .eq("id", id)
        .single();

      const elAgentId = (agent as unknown as AIAgent | null)?.elevenlabs_agent_id;

      if (elAgentId) {
        await callElevenLabsProxy({
          action: "delete_agent",
          agent_id: elAgentId,
        });
      }

      const { error } = await supabase.from("ai_agents" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      toast.success("Agente eliminato");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore nell'eliminazione");
    },
  });
}
