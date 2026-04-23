// MP05 — Hook React Query per configurazione AI provider.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { toast } from "sonner";
import type { Database, Json } from "@/integrations/supabase/types";

export type AiModelCatalog = Database["public"]["Tables"]["ai_model_catalog"]["Row"];
export type AiModelConfig = Database["public"]["Tables"]["ai_model_config"]["Row"];

export type TaskKind =
  | "bot_operativo_titolare"
  | "bot_operativo_operaio"
  | "assistenza_clienti"
  | "lead_qualificazione"
  | "vision_ddt"
  | "vision_cantiere"
  | "parse_rapportino"
  | "computo_metrico"
  | "bank_categorize"
  | "chat_routine"
  | "default";

export const TASK_META: Record<TaskKind, { label: string; desc: string }> = {
  bot_operativo_titolare: {
    label: "Bot — Titolare",
    desc: "Il titolare interroga il bot su cantieri, marginalità, scadenze",
  },
  bot_operativo_operaio: {
    label: "Bot — Operaio",
    desc: "Operaio invia rapportini, DDT, foto, presenze via WhatsApp",
  },
  assistenza_clienti: {
    label: "Assistenza Clienti",
    desc: "Chat con clienti finali — apri ticket, stato ordine",
  },
  lead_qualificazione: {
    label: "Qualifica Lead",
    desc: "Conversazione commerciale con nuovi contatti da ads",
  },
  vision_ddt: {
    label: "Analisi DDT",
    desc: "Estrazione dati da foto DDT di cantiere",
  },
  vision_cantiere: {
    label: "Foto Cantiere",
    desc: "Descrizione immagini cantiere + tag automatici",
  },
  parse_rapportino: {
    label: "Parse Rapportino",
    desc: "Estrazione strutturata da testo rapportino",
  },
  computo_metrico: {
    label: "Computo Metrico",
    desc: "Parsing di computi metrici complessi",
  },
  bank_categorize: {
    label: "Categorizzazione Bancaria",
    desc: "Classifica movimenti bancari",
  },
  chat_routine: {
    label: "Chat Routine",
    desc: "Conversazione generica a basso costo",
  },
  default: {
    label: "Default",
    desc: "Fallback per task senza config dedicata",
  },
};

export function useAiModelCatalog() {
  return useQuery({
    queryKey: ["ai", "catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_model_catalog")
        .select("*")
        .eq("status", "active")
        .order("provider", { ascending: true })
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AiModelCatalog[];
    },
    staleTime: 60 * 60_000,
  });
}

/** Config merged: company-specific override su global defaults. */
export function useAiModelConfig() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["ai", "config", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const [globalRes, companyRes] = await Promise.all([
        supabase.from("ai_model_config").select("*").is("company_id", null),
        supabase
          .from("ai_model_config")
          .select("*")
          .eq("company_id", companyId!),
      ]);
      if (globalRes.error) throw globalRes.error;
      if (companyRes.error) throw companyRes.error;
      const map = new Map<string, AiModelConfig & { source: "global" | "company" }>();
      (globalRes.data ?? []).forEach((c) =>
        map.set(c.task_kind, { ...c, source: "global" }),
      );
      (companyRes.data ?? []).forEach((c) =>
        map.set(c.task_kind, { ...c, source: "company" }),
      );
      return Array.from(map.values());
    },
  });
}

export interface UpsertConfigPayload {
  task_kind: TaskKind;
  primary_model?: string;
  fallback_chain?: string[];
  max_cost_usd_per_call?: number;
  temperature?: number;
  max_tokens?: number;
  enabled?: boolean;
}

export function useUpdateAiModelConfig() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpsertConfigPayload) => {
      const { task_kind, ...rest } = payload;
      const updates: Record<string, unknown> = { ...rest };
      if (updates.fallback_chain) {
        updates.fallback_chain = updates.fallback_chain as Json;
      }
      const { error } = await supabase
        .from("ai_model_config")
        .upsert(
          {
            company_id: companyId!,
            task_kind,
            // primary_model è NOT NULL: se non fornito, non passarlo
            ...(updates as Record<string, unknown>),
          } as never,
          { onConflict: "company_id,task_kind" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai", "config"] });
      toast.success("Configurazione modello aggiornata");
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });
}

export interface AiUsageStats {
  total_requests: number;
  total_cost_usd: number;
  success_rate: number;
  fallback_count: number;
  total_tokens: number;
  by_model: Array<{ model: string; count: number; cost_usd: number }>;
}

export function useAiUsageStats({ days = 30 }: { days?: number } = {}) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["ai", "usage-stats", companyId, days],
    enabled: !!companyId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AiUsageStats> => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("ai_model_usage_log")
        .select("ok, cost_usd, fallback_hops, model_used, tokens_total")
        .eq("company_id", companyId!)
        .gte("ts", since.toISOString());
      if (error) throw error;
      const rows = data ?? [];

      const byModelMap = new Map<string, { count: number; cost_usd: number }>();
      for (const r of rows) {
        const k = r.model_used ?? "unknown";
        const cur = byModelMap.get(k) ?? { count: 0, cost_usd: 0 };
        cur.count += 1;
        cur.cost_usd += Number(r.cost_usd ?? 0);
        byModelMap.set(k, cur);
      }

      return {
        total_requests: rows.length,
        total_cost_usd: rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0),
        success_rate:
          rows.length > 0 ? rows.filter((r) => r.ok).length / rows.length : 1,
        fallback_count: rows.filter((r) => (r.fallback_hops ?? 0) > 0).length,
        total_tokens: rows.reduce(
          (s, r) => s + Number(r.tokens_total ?? 0),
          0,
        ),
        by_model: Array.from(byModelMap.entries())
          .map(([model, v]) => ({ model, ...v }))
          .sort((a, b) => b.cost_usd - a.cost_usd),
      };
    },
  });
}

export function useSyncOpenRouterCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "sync-openrouter-catalog",
        { body: {} },
      );
      if (error) throw error;
      return data as { upserted?: number; deprecated?: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ai", "catalog"] });
      toast.success(
        `Catalogo sincronizzato: ${data?.upserted ?? 0} upserted, ${data?.deprecated ?? 0} deprecati`,
      );
    },
    onError: (e: Error) => toast.error(`Errore sync: ${e.message}`),
  });
}
