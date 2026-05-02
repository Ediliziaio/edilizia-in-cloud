import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { callElevenLabsProxy } from "@/modules/ai-agents/hooks/useElevenLabsProxy";
import { logger } from "@/utils/logger";
import { withClientTimeout } from "@/lib/query-timeout";
import { toast } from "sonner";
import type {
  UnifiedAgent,
  UnifiedAgentInsert,
  AICompanyStats,
} from "@/types/unifiedAgent.types";

const QUERY_KEY = "unified-ai-agents";

const normalizeText = (value: unknown) => String(value ?? "").trim();

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const assertAgentBaseConfig = (agent: Pick<UnifiedAgentInsert, "nome" | "system_prompt">) => {
  if (!normalizeText(agent.nome)) {
    throw new Error("Inserisci un nome per l'agente AI.");
  }
  if (normalizeText(agent.system_prompt).length < 20) {
    throw new Error("Completa il prompt di sistema prima di salvare l'agente.");
  }
};

const assertAgentReadyForActivation = (agent: Partial<UnifiedAgent>) => {
  assertAgentBaseConfig({
    nome: agent.nome ?? "",
    system_prompt: agent.system_prompt ?? "",
  });

  if ((agent.tipo === "vocale" || agent.tipo === "campagna") && !agent.elevenlabs_agent_id) {
    throw new Error("L'agente vocale non è collegato a ElevenLabs: completa la configurazione prima di attivarlo.");
  }
};

// ─── List agents ───
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

      const { data, error } = await withClientTimeout(q, "Caricamento agenti AI");
      if (error) throw error;
      return (data ?? []) as unknown as UnifiedAgent[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

// ─── Get single agent ───
export function useUnifiedAgent(id: string | undefined) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: [QUERY_KEY, "detail", companyId, id],
    enabled: !!id && !!companyId,
    queryFn: async (): Promise<UnifiedAgent> => {
      const { data, error } = await withClientTimeout(
        supabase
        .from("ai_agents_v2" as never)
        .select("*")
        .eq("company_id", companyId!)
        .eq("id", id!)
        .single(),
        "Caricamento agente AI",
      );
      if (error) throw error;
      return data as unknown as UnifiedAgent;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

// ─── Create agent ───
export function useCreateUnifiedAgent() {
  const queryClient = useQueryClient();
  const companyId = useEffectiveCompanyId();

  return useMutation({
    mutationFn: async (input: UnifiedAgentInsert) => {
      if (!companyId) throw new Error("Nessuna azienda associata");
      assertAgentBaseConfig(input);

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

      const insertPayload: Record<string, unknown> = {
          company_id: companyId,
          nome: normalizeText(input.nome),
          tipo: input.tipo,
          stato: "bozza",
          descrizione: normalizeText(input.descrizione) || null,
          system_prompt: normalizeText(input.system_prompt),
          primo_messaggio: normalizeText(input.primo_messaggio),
          lingua: input.lingua || "it",
          llm_model: input.llm_model || "gemini-2.5-flash",
          elevenlabs_agent_id: elAgentId,
          elevenlabs_voice_id: input.elevenlabs_voice_id || null,
          creato_da: user?.user?.id || null,
      };

      // Persist wizard-collected fields
      if (input.temperatura !== undefined) insertPayload.temperatura = clampNumber(input.temperatura, 0, 1, 0.7);
      if (input.voice_nome) insertPayload.voice_nome = input.voice_nome;
      if (input.risposta_automatica !== undefined) insertPayload.risposta_automatica = input.risposta_automatica;
      if (input.registra_chiamate !== undefined) insertPayload.registra_chiamate = input.registra_chiamate;
      if (input.trascrivi_chiamate !== undefined) insertPayload.trascrivi_chiamate = input.trascrivi_chiamate;
      if (input.rileva_segreteria !== undefined) insertPayload.rileva_segreteria = input.rileva_segreteria;
      if (input.squillo_max !== undefined) insertPayload.squillo_max = clampNumber(input.squillo_max, 1, 20, 6);
      if (input.durata_max_secondi !== undefined) insertPayload.durata_max_secondi = clampNumber(input.durata_max_secondi, 30, 3600, 300);
      if (input.widget_titolo) insertPayload.widget_titolo = input.widget_titolo;
      if (input.widget_colore) insertPayload.widget_colore = input.widget_colore;
      if (input.widget_posizione) insertPayload.widget_posizione = input.widget_posizione;

      const { data, error } = await supabase
        .from("ai_agents_v2" as never)
        .insert(insertPayload as never)
        .select("id")
        .single();

      if (error) {
        if (elAgentId) {
          try {
            await callElevenLabsProxy({ action: "delete_agent", agent_id: elAgentId });
          } catch (_) { /* rollback ElevenLabs non critico — silenzioso */ }
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

// ─── Delete agent ───
export function useDeleteUnifiedAgent() {
  const queryClient = useQueryClient();
  const companyId = useEffectiveCompanyId();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Nessuna azienda associata");

      const { data: agent, error: fetchError } = await supabase
        .from("ai_agents_v2" as never)
        .select("elevenlabs_agent_id, stato")
        .eq("company_id", companyId)
        .eq("id", id)
        .single();
      if (fetchError) throw fetchError;

      const elId = (agent as any)?.elevenlabs_agent_id;
      if ((agent as any)?.stato === "attivo") {
        throw new Error("Metti in pausa l'agente prima di eliminarlo.");
      }

      const { error } = await supabase
        .from("ai_agents_v2" as never)
        .delete()
        .eq("company_id", companyId)
        .eq("id", id);
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

// ─── Update status ───
export function useUpdateUnifiedAgentStatus() {
  const queryClient = useQueryClient();
  const companyId = useEffectiveCompanyId();

  return useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      if (!companyId) throw new Error("Nessuna azienda associata");
      if (stato === "attivo") {
        const { data, error } = await supabase
          .from("ai_agents_v2" as never)
          .select("nome,tipo,system_prompt,elevenlabs_agent_id")
          .eq("company_id", companyId)
          .eq("id", id)
          .single();
        if (error) throw error;
        assertAgentReadyForActivation(data as unknown as Partial<UnifiedAgent>);
      }

      const { error } = await supabase
        .from("ai_agents_v2" as never)
        .update({ stato } as never)
        .eq("company_id", companyId)
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

// ─── Duplicate agent ───
export function useDuplicateUnifiedAgent() {
  const queryClient = useQueryClient();
  const companyId = useEffectiveCompanyId();

  return useMutation({
    mutationFn: async (sourceId: string) => {
      if (!companyId) throw new Error("Nessuna azienda associata");

      const { data: source, error: fetchError } = await supabase
        .from("ai_agents_v2" as never)
        .select("*")
        .eq("company_id", companyId)
        .eq("id", sourceId)
        .single();

      if (fetchError || !source) throw fetchError || new Error("Agente non trovato");

      const s = source as unknown as UnifiedAgent;
      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("ai_agents_v2" as never)
        .insert({
          company_id: companyId,
          nome: `${s.nome} (copia)`,
          tipo: s.tipo,
          descrizione: s.descrizione,
          system_prompt: s.system_prompt,
          primo_messaggio: s.primo_messaggio,
          lingua: s.lingua,
          llm_model: s.llm_model,
          temperatura: s.temperatura,
          elevenlabs_voice_id: s.elevenlabs_voice_id,
          voice_nome: s.voice_nome,
          stato: "bozza",
          creato_da: user?.user?.id || null,
        } as never)
        .select("id")
        .single();

      if (error) throw error;
      return data as unknown as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Agente duplicato come bozza");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore nella duplicazione");
    },
  });
}

// ─── Company stats ───
export function useAICompanyStats() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["ai-company-stats", companyId],
    enabled: !!companyId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AICompanyStats | null> => {
      const { data, error } = await withClientTimeout(
        supabase.rpc("get_ai_company_stats" as never, {
          p_company_id: companyId!,
          p_giorni: 30,
        } as never),
        "Caricamento statistiche agenti AI",
      );
      if (error) {
        logger.warn("Stats RPC failed:", error);
        return null;
      }
      if (!data) return null;
      const row = Array.isArray(data) ? data[0] : data;
      return row as unknown as AICompanyStats;
    },
  });
}
