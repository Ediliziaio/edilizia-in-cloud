import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export interface AgentCredits {
  id: string;
  company_id: string;
  balance_eur: number;
  total_recharged_eur: number;
  total_spent_eur: number;
  auto_recharge_enabled: boolean;
  auto_recharge_threshold: number;
  auto_recharge_amount: number;
  auto_recharge_method: string | null;
  alert_threshold_eur: number;
  calls_blocked: boolean;
  blocked_at: string | null;
  blocked_reason: string | null;
  updated_at: string;
}

export interface CreditTopup {
  id: string;
  company_id: string;
  amount_eur: number;
  type: string;
  status: string;
  payment_method: string | null;
  invoice_number: string | null;
  notes: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface CreditUsage {
  id: string;
  company_id: string;
  conversation_id: string | null;
  agent_id: string | null;
  duration_sec: number;
  duration_min: number;
  llm_model: string;
  tts_model: string;
  cost_real_per_min: number;
  cost_billed_per_min: number;
  cost_real_total: number;
  cost_billed_total: number;
  margin_total: number;
  balance_before: number;
  balance_after: number;
  call_direction: string;
  created_at: string;
}

export function useAgentCredits() {
  return useQuery({
    queryKey: queryKeys.aiCredits.credits(),
    queryFn: async (): Promise<AgentCredits | null> => {
      const { data, error } = await supabase
        .from("ai_credits" as never)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as unknown as AgentCredits | null;
    },
    staleTime: 30_000,
  });
}

export function useCreditTopups() {
  return useQuery({
    queryKey: queryKeys.aiCredits.topups(),
    queryFn: async (): Promise<CreditTopup[]> => {
      const { data, error } = await supabase
        .from("ai_credit_topups" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as unknown as CreditTopup[]) ?? [];
    },
  });
}

export function useCreditUsage(limit = 20) {
  return useQuery({
    queryKey: queryKeys.aiCredits.usage(limit),
    queryFn: async (): Promise<CreditUsage[]> => {
      const { data, error } = await supabase
        .from("ai_credit_usage" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as unknown as CreditUsage[]) ?? [];
    },
  });
}

export function useUsageByAgent() {
  return useQuery({
    queryKey: queryKeys.aiCredits.usageByAgent(),
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: usage, error } = await supabase
        .from("ai_credit_usage" as never)
        .select("agent_id, duration_min, cost_billed_total, llm_model, tts_model")
        .gte("created_at", startOfMonth.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;

      const { data: agents } = await supabase
        .from("ai_agents" as never)
        .select("id, name");

      const agentMap = new Map(
        ((agents as { id: string; name: string }[]) ?? []).map((a) => [a.id, a.name])
      );

      const grouped = new Map<
        string,
        { name: string; calls: number; minutes: number; cost: number; llm: string; tts: string }
      >();

      for (const u of (usage as { agent_id: string; duration_min: number; cost_billed_total: number; llm_model: string; tts_model: string }[]) ?? []) {
        const existing = grouped.get(u.agent_id) || {
          name: agentMap.get(u.agent_id) || "Sconosciuto",
          calls: 0,
          minutes: 0,
          cost: 0,
          llm: u.llm_model,
          tts: u.tts_model,
        };
        existing.calls += 1;
        existing.minutes += u.duration_min;
        existing.cost += u.cost_billed_total;
        grouped.set(u.agent_id, existing);
      }

      return Array.from(grouped.entries()).map(([agentId, data]) => ({
        agent_id: agentId,
        ...data,
      }));
    },
  });
}
