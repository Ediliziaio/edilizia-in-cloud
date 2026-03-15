import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { callElevenLabsProxy } from "@/modules/ai-agents/hooks/useElevenLabsProxy";
import { logger } from "@/utils/logger";
import { toast } from "sonner";
import type {
  UnifiedAgent,
  UnifiedAgentInsert,
  UnifiedAgentUpdate,
  AICompanyStats,
} from "@/types/unifiedAgent.types";

const QUERY_KEY = "unified-ai-agents";

export function useUnifiedAgents(filters?: {
  tipo?: string;
  stato?: string;
  cerca?: string;
}) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: [QUERY_KEY, companyId, filters],
    enabled: !!companyId,
    queryFn: async (): Promise<UnifiedAgent[]> => {
      let q = supabase
        .from("ai_agents_v2" as never)
        .select("*")
        .eq("company_id", companyId!)
        .order("creato_il", { ascending: false });

      if (filters?.tipo && filters.tipo !== "tutti") {
        q = q.eq("tipo", filters.tipo);
      }
      if (filters?.stato && filters.stato !== "tutti") {
        q = q.eq("stato", filters.stato);
      }
      if (filters?.cerca) {
        q = q.ilike("nome", `%${filters.cerca}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as UnifiedAgent[];
    },
  });
}

export function useUnifiedAgent(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, "detail", id],
    enabled: !!id,
    queryFn: async (): Promise<UnifiedAgent> => {
      const { data, error } = await supabase
        .from("ai_agents_v2" as never)
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as UnifiedAgent;
    },
  });
}

export function useCreateUnifiedAgent() {
  const queryClient = useQueryClient();
  const companyId = useEffectiveCompanyId();

  return useMutation({
    mutationFn: async (input: UnifiedAgentInsert) => {
      if (!companyId) throw new Error("Nessuna azienda associata");

      const needsElevenLabs = input.tipo === "vocale" || input.tipo === "campagna";
      let elAgentId: string | null = null;

      if (needsElevenLabs) {
        try {
          const result = await callElevenLabsProxy<{ elevenlabs_agent_id: string }>({
            action: "create_agent",
            payload: {
              name: input.nome,
              system_prompt: input.system_prompt || "",
              first_message: input.primo_messaggio || "",
              llm_model: input.llm_model || "gemini-2.5-flash",
              language: input.lingua || "it",
            },
          });
          elAgentId = result.elevenlabs_agent_id || null;
        } catch (e) {
          logger.warn("ElevenLabs creation failed, proceeding without:", e);
        }
      }

      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("ai_agents_v2" as never)
        .insert({
          company_id: companyId,
          nome: input.nome,
          tipo: input.tipo,
          descrizione: input.descrizione || null,
          system_prompt: input.system_prompt || "",
          primo_messaggio: input.primo_messaggio || "",
          lingua: input.lingua || "it",
          llm_model: input.llm_model || "gemini-2.5-flash",
          elevenlabs_agent_id: elAgentId,
          elevenlabs_voice_id: input.elevenlabs_voice_id || null,
          creato_da: user?.user?.id || null,
        } as never)
        .select("id")
        .single();

      if (error) {
        // Cleanup orphaned ElevenLabs agent
        if (elAgentId) {
          try {
            await callElevenLabsProxy({ action: "delete_agent", agent_id: elAgentId });
          } catch (_) {}
        }
        throw error;
      }

      return data as unknown as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Agente creato con successo");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore nella creazione dell'agente");
    },
  });
}

export function useDeleteUnifiedAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: agent } = await supabase
        .from("ai_agents_v2" as never)
        .select("elevenlabs_agent_id")
        .eq("id", id)
        .single();

      const elId = (agent as any)?.elevenlabs_agent_id;

      const { error } = await supabase.from("ai_agents_v2" as never).delete().eq("id", id);
      if (error) throw error;

      if (elId) {
        try {
          await callElevenLabsProxy({ action: "delete_agent", agent_id: elId });
        } catch (e) {
          logger.warn("ElevenLabs delete failed:", e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Agente eliminato");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore nell'eliminazione");
    },
  });
}

export function useUpdateUnifiedAgentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const { error } = await supabase
        .from("ai_agents_v2" as never)
        .update({ stato } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore nell'aggiornamento stato");
    },
  });
}

export function useAICompanyStats() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["ai-company-stats", companyId],
    enabled: !!companyId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AICompanyStats | null> => {
      const { data, error } = await supabase.rpc("get_ai_company_stats" as never, {
        p_company_id: companyId!,
        p_giorni: 30,
      });
      if (error) {
        logger.warn("Stats RPC failed:", error);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return row as unknown as AICompanyStats;
    },
  });
}
