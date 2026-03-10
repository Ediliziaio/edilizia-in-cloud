import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { callElevenLabsProxy } from "@/modules/ai-agents/hooks/useElevenLabsProxy";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/utils/logger";
import type { InternalAgent, InternalAgentInsert, InternalAgentUpdate } from "../types/internalAgent.types";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export function useInternalAgents() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.internalAgents.list(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<InternalAgent[]> => {
      const { data, error } = await supabase
        .from("internal_ai_agents" as never)
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as InternalAgent[];
    },
  });
}

export function useInternalAgent(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.internalAgents.detail(id),
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

      const elAgentId = result.elevenlabs_agent_id || null;

      // Get company and user info
      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("company_id")
        .single();

      const companyId = (profile as any)?.company_id;
      if (!companyId) throw new Error("Nessuna azienda associata");

      const { data: user } = await supabase.auth.getUser();
      const userId = user?.user?.id;

      // Insert locally — if this fails, cleanup remote agent
      try {
        const { data: newAgent, error } = await supabase
          .from("internal_ai_agents" as never)
          .insert({
            company_id: companyId,
            elevenlabs_agent_id: elAgentId,
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
      } catch (localError) {
        // Cleanup: delete orphaned agent on ElevenLabs
        if (elAgentId) {
          try {
            await callElevenLabsProxy({ action: "delete_agent", agent_id: elAgentId });
            logger.info("Cleanup: agente orfano rimosso dal provider esterno", { elAgentId });
          } catch (cleanupError) {
            logger.error(`Cleanup fallito: agente orfano su provider esterno (ID: ${elAgentId})`, cleanupError);
          }
        }
        throw localError;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.internalAgents.all });
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
      let syncFailed = false;
      if (elAgentId && (update.system_prompt || update.first_message || update.voice_id || update.name)) {
        try {
          await callElevenLabsProxy({
            action: "update_agent",
            agent_id: elAgentId,
            payload: update as Record<string, unknown>,
          });
        } catch (syncError) {
          syncFailed = true;
          logger.error("Sync provider esterno fallita durante update agente", { elAgentId, syncError });
        }
      }

      // Update locally
      const { error } = await supabase
        .from("internal_ai_agents" as never)
        .update({ ...update, updated_at: new Date().toISOString() } as never)
        .eq("id", id);

      if (error) throw error;

      return { syncFailed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.internalAgents.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.internalAgents.all });
      if (result?.syncFailed) {
        toast.warning("Configurazione salvata localmente, ma la sincronizzazione con il provider vocale non è riuscita.");
      }
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

      let syncFailed = false;
      if (elAgentId) {
        try {
          await callElevenLabsProxy({
            action: "delete_agent",
            agent_id: elAgentId,
          });
        } catch (syncError) {
          syncFailed = true;
          logger.error("Sync provider esterno fallita durante delete agente", { elAgentId, syncError });
        }
      }

      const { error } = await supabase.from("internal_ai_agents" as never).delete().eq("id", id);
      if (error) throw error;

      return { syncFailed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.internalAgents.all });
      if (result?.syncFailed) {
        toast.warning("Agente eliminato dal sistema, ma potrebbe restare attivo sul provider vocale esterno.");
      } else {
        toast.success("Agente eliminato");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore nell'eliminazione");
    },
  });
}
