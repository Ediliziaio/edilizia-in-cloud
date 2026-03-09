import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ServerHealthScore {
  id: string;
  company_id: string;
  score: number;
  health: string;
  login_score: number;
  orders_score: number;
  features_score: number;
  team_score: number;
  engagement_score: number;
  churn_risk: number;
  signals: string[];
  calculated_at: string;
}

export function useHealthScores() {
  return useQuery({
    queryKey: ["health-scores-server"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_health_scores" as never)
        .select("*")
        .order("score", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ServerHealthScore[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCompanyHealthScore(companyId: string | undefined) {
  return useQuery({
    queryKey: ["health-score", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_health_scores" as never)
        .select("*")
        .eq("company_id", companyId as never)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ServerHealthScore | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
