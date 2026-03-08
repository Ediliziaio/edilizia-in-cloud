import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { callElevenLabsProxy } from "@/modules/ai-agents/hooks/useElevenLabsProxy";
import type { InternalAgent, InternalAgentInsert, InternalAgentUpdate } from "../types/internalAgent.types";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export function useInternalAgents() {
  return useQuery({
    queryKey: ["internal-ai-agents"],
    queryFn: async (): Promise<InternalAgent[]> => {
      const { data, error } = await supabase
        .from("internal_ai_agents" as never)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as InternalAgent[];
    },
  });
}

export function useInternalAgent(id: string | undefined) {
  return useQuery({
    queryKey: ["internal-ai-agents", id],
    enabled: !!id,
    queryFn: async (): Promise<InternalAgent> => {
      const { data, error } = await supabase
        .from("internal_ai_agents" as never)
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as unknown as InternalAgent;
    },
  });
}

export function useCreateInternalAgent() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (input: InternalAgentInsert) => {
      // Create on ElevenLabs via proxy
      const result = await callElevenLabsProxy<{ agent_id: string; elevenlabs_agent_id: string }>({
        action: "create_agent",
        payload: {
          name: input.name,
          system_prompt: input.system_prompt || "",
          first_message: input.first_message || "",
          llm_model: input.llm_model || "gemini-2.5-flash",
          language: input.language || "it",
        },
      });

      // Now update the local internal_ai_agents table with ElevenLabs ID
      // The proxy creates in ai_agents, we need to create in internal_ai_agents
      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("company_id")
        .single();

      const companyId = (profile as any)?.company_id;
      if (!companyId) throw new Error("Nessuna azienda associata");

      const { data: user } = await supabase.auth.getUser();
      const userId = user?.user?.id;

      const { data: newAgent, error } = await supabase
        .from("internal_ai_agents" as never)
        .insert({
          company_id: companyId,
          elevenlabs_agent_id: result.elevenlabs_agent_id || null,
          name: input.name,
          agent_type: input.agent_type || "customer_service",
          system_prompt: input.system_prompt || "",
          first_message: input.first_message || "",
          voice_id: input.voice_id || "",
          llm_model: input.llm_model || "gemini-2.5-flash",
          language: input.language || "it",
          created_by: userId,
          enabled_tools: ["identify_caller", "get_client_info", "get_order_status", "get_orders_list", "get_appointment_info"],
        } as never)
        .select("id")
        .single();

      if (error) throw error;
      return { agent_id: (newAgent as any)?.id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["internal-ai-agents"] });
      toast.success("Agente interno creato con successo");
      navigate(`/azienda/agente-interno/${data.agent_id}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore nella creazione dell'agente");
    },
  });
}

export function useUpdateInternalAgent(id: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (update: InternalAgentUpdate) => {
      if (!id) throw new Error("ID agente mancante");

      // Get elevenlabs_agent_id for sync
      const { data: agent } = await supabase
        .from("internal_ai_agents" as never)
        .select("elevenlabs_agent_id")
        .eq("id", id)
        .single();

      const elAgentId = (agent as any)?.elevenlabs_agent_id;

      // Sync to ElevenLabs if connected
      if (elAgentId && (update.system_prompt || update.first_message || update.voice_id || update.name)) {
        try {
          await callElevenLabsProxy({
            action: "update_agent",
            agent_id: elAgentId,
            payload: update as Record<string, unknown>,
          });
        } catch {
          // Continue with local update even if EL fails
        }
      }

      // Update locally
      const { error } = await supabase
        .from("internal_ai_agents" as never)
        .update({ ...update, updated_at: new Date().toISOString() } as never)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internal-ai-agents", id] });
      queryClient.invalidateQueries({ queryKey: ["internal-ai-agents"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore nel salvataggio");
    },
  });
}

export function useDeleteInternalAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: agent } = await supabase
        .from("internal_ai_agents" as never)
        .select("elevenlabs_agent_id")
        .eq("id", id)
        .single();

      const elAgentId = (agent as any)?.elevenlabs_agent_id;

      if (elAgentId) {
        try {
          await callElevenLabsProxy({
            action: "delete_agent",
            agent_id: elAgentId,
          });
        } catch {
          // Continue deletion
        }
      }

      const { error } = await supabase.from("internal_ai_agents" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internal-ai-agents"] });
      toast.success("Agente eliminato");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore nell'eliminazione");
    },
  });
}
