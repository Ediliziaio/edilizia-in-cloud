// MP05-FIX — Hook AI provider refactored.
// RIMOSSI: useAiModelConfig, useUpdateAiModelConfig, useAiUsageStats (azienda
//   non sceglie modello né vede costi reali — F1-F3).
// AGGIUNTI: useCompanyAiSpendStats (view v_company_ai_spend, solo cost_billed).
// MANTENUTI: useAiModelCatalog (read-only, referenceable), useSyncOpenRouterCatalog.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export type AiModelCatalog = Database["public"]["Tables"]["ai_model_catalog"]["Row"];

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

// TASK_META sopravvive solo per UI SuperAdmin (import da admin panel). Per
// l'azienda le descrizioni arrivano da ai_pricing_markup.display_label.
export const TASK_META: Record<TaskKind, { label: string; desc: string }> = {
  bot_operativo_titolare: { label: "Bot — Titolare", desc: "Interrogazioni titolare su cantieri/margini/scadenze" },
  bot_operativo_operaio: { label: "Bot — Operaio", desc: "Rapportini, DDT, foto, presenze via WhatsApp" },
  assistenza_clienti: { label: "Assistenza Clienti", desc: "Chat AI con clienti finali" },
  lead_qualificazione: { label: "Qualifica Lead", desc: "Conversazione commerciale con lead" },
  vision_ddt: { label: "Analisi DDT", desc: "Estrazione dati da foto DDT" },
  vision_cantiere: { label: "Foto Cantiere", desc: "Descrizione immagini cantiere" },
  parse_rapportino: { label: "Parse Rapportino", desc: "Estrazione strutturata da testo" },
  computo_metrico: { label: "Computo Metrico", desc: "Parsing computi metrici" },
  bank_categorize: { label: "Categorizzazione Bancaria", desc: "Classifica movimenti" },
  chat_routine: { label: "Chat Routine", desc: "Conversazione routine basso costo" },
  default: { label: "Default", desc: "Fallback task senza config dedicata" },
};

/** Catalog read-only: referenceable da UI SuperAdmin o whitelist check. */
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

/** Sync catalog OpenRouter — SuperAdmin. */
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

// ═══════════════════════════════════════════════════════════════════════════
// MP05-FIX — Hook AZIENDA (read-only, NO modello esposto, NO costo reale)
// ═══════════════════════════════════════════════════════════════════════════

export interface CompanyAiSpendRow {
  day: string;
  task_kind: string;
  n_calls: number;
  total_spent_eur: number;
  total_tokens: number;
}

/**
 * Aggregato spesa AI company dalla view v_company_ai_spend.
 * Ritorna solo cost_billed_eur (prezzo fatturato) — mai cost_real_eur né
 * margin_eur (protetti anche a livello RLS/view).
 */
export function useCompanyAiSpendStats({ days = 30 }: { days?: number } = {}) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["ai", "company-spend", companyId, days],
    enabled: !!companyId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceDay = since.toISOString().substring(0, 10);

      const { data, error } = await supabase
        .from("v_company_ai_spend")
        .select("day, task_kind, n_calls, total_spent_eur, total_tokens")
        .eq("company_id", companyId!)
        .gte("day", sinceDay)
        .order("day", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as CompanyAiSpendRow[];

      const total_spent_eur = rows.reduce(
        (s, r) => s + Number(r.total_spent_eur ?? 0),
        0,
      );
      const total_calls = rows.reduce(
        (s, r) => s + Number(r.n_calls ?? 0),
        0,
      );

      // Aggrega per task_kind per breakdown UI
      const byTask = new Map<string, { n_calls: number; total_spent_eur: number }>();
      for (const r of rows) {
        const cur = byTask.get(r.task_kind) ?? { n_calls: 0, total_spent_eur: 0 };
        cur.n_calls += Number(r.n_calls ?? 0);
        cur.total_spent_eur += Number(r.total_spent_eur ?? 0);
        byTask.set(r.task_kind, cur);
      }

      return {
        total_spent_eur,
        total_calls,
        rows,
        by_task: Array.from(byTask.entries())
          .map(([task_kind, v]) => ({ task_kind, ...v }))
          .sort((a, b) => b.total_spent_eur - a.total_spent_eur),
      };
    },
  });
}
