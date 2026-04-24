import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LeadScoringInput } from "@/utils/leadScoring";

export interface LeadScoringConfig {
  company_id: string;
  weight_company_name: number;
  weight_phone: number;
  weight_address: number;
  weight_city: number;
  weight_open_opportunity: number;
  weight_recent_activity: number;
  points_per_activity: number;
  max_activity_points: number;
  max_history_points: number;
  source_scores: Record<string, number>;
  tier_a_threshold: number;
  tier_b_threshold: number;
  tier_c_threshold: number;
  updated_at?: string;
  updated_by?: string | null;
}

export const DEFAULT_LEAD_SCORING_CONFIG: Omit<LeadScoringConfig, "company_id"> = {
  weight_company_name: 5,
  weight_phone: 5,
  weight_address: 3,
  weight_city: 5,
  weight_open_opportunity: 15,
  weight_recent_activity: 10,
  points_per_activity: 2,
  max_activity_points: 20,
  max_history_points: 5,
  source_scores: {
    referral: 15,
    passaparola: 15,
    cliente_esistente: 12,
    fiera: 10,
    linkedin: 8,
    sito_web: 8,
    campagna: 7,
    email: 5,
    social: 5,
    chiamata_fredda: 3,
    cold_call: 3,
  },
  tier_a_threshold: 40,
  tier_b_threshold: 25,
  tier_c_threshold: 10,
};

export const leadScoringConfigKeys = {
  byCompany: (companyId: string) =>
    ["lead-scoring-config", companyId] as const,
};

export function useLeadScoringConfig(companyId: string | null) {
  return useQuery({
    queryKey: leadScoringConfigKeys.byCompany(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<LeadScoringConfig> => {
      const { data, error } = await supabase
        .from("lead_scoring_config")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      if (data) {
        return {
          ...(data as unknown as LeadScoringConfig),
          source_scores: (data.source_scores ?? DEFAULT_LEAD_SCORING_CONFIG.source_scores) as Record<string, number>,
        };
      }
      return { company_id: companyId!, ...DEFAULT_LEAD_SCORING_CONFIG };
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useUpsertLeadScoringConfig(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: Partial<Omit<LeadScoringConfig, "company_id">>) => {
      if (!companyId) throw new Error("companyId mancante");
      const payload = { company_id: companyId, ...config };
      const { error } = await supabase
        .from("lead_scoring_config")
        .upsert(payload, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: leadScoringConfigKeys.byCompany(companyId ?? ""),
      });
    },
  });
}

/**
 * Versione dinamica di calculateLeadScore che rispetta la config della company.
 * Se cfg è null usa i default (stessi pesi hardcoded pre-Sprint 4).
 */
export function calculateLeadScoreWithConfig(
  input: LeadScoringInput,
  cfg: LeadScoringConfig | null | undefined
): {
  leadScore: number;
  icpScore: number;
  behavioralScore: number;
  breakdown: Record<string, number>;
} {
  const c: Omit<LeadScoringConfig, "company_id"> = cfg ?? {
    company_id: "",
    ...DEFAULT_LEAD_SCORING_CONFIG,
  };
  const breakdown: Record<string, number> = {};

  // ICP
  let icpScore = 0;
  if (input.icpOverride !== null && input.icpOverride !== undefined) {
    icpScore = Math.min(50, Math.max(0, input.icpOverride));
    breakdown["ICP manuale"] = icpScore;
  } else {
    if (input.hasCompanyName) {
      icpScore += c.weight_company_name;
      breakdown["Azienda compilata"] = c.weight_company_name;
    }
    if (input.hasPhone) {
      icpScore += c.weight_phone;
      breakdown["Telefono compilato"] = c.weight_phone;
    }
    if (input.hasAddress) {
      icpScore += c.weight_address;
      breakdown["Indirizzo compilato"] = c.weight_address;
    }
    if (input.city) {
      icpScore += c.weight_city;
      breakdown["Città compilata"] = c.weight_city;
    }
    const srcKey = input.source?.toLowerCase() ?? "";
    const srcScore = c.source_scores[srcKey] ?? 0;
    if (srcScore > 0) {
      icpScore += srcScore;
      breakdown[`Fonte: ${input.source}`] = srcScore;
    }
    icpScore = Math.min(50, icpScore);
  }

  // Behavioral
  let behavioralScore = 0;
  const activityPoints = Math.min(
    c.max_activity_points,
    input.activitiesCount * c.points_per_activity
  );
  if (activityPoints > 0) {
    behavioralScore += activityPoints;
    breakdown[`Attività (${input.activitiesCount})`] = activityPoints;
  }
  if (input.hasOpenOpportunity) {
    behavioralScore += c.weight_open_opportunity;
    breakdown["Opportunità aperta"] = c.weight_open_opportunity;
  }
  if (input.hasRecentActivity) {
    behavioralScore += c.weight_recent_activity;
    breakdown["Attività recente (14gg)"] = c.weight_recent_activity;
  }
  const historyPoints = Math.min(c.max_history_points, input.opportunitiesCount);
  if (historyPoints > 0) {
    behavioralScore += historyPoints;
    breakdown[`Storico opportunità (${input.opportunitiesCount})`] = historyPoints;
  }
  behavioralScore = Math.min(50, behavioralScore);

  return {
    leadScore: icpScore + behavioralScore,
    icpScore,
    behavioralScore,
    breakdown,
  };
}

export function getIcpTierWithConfig(
  icpScore: number,
  cfg: LeadScoringConfig | null | undefined
): "A" | "B" | "C" | "D" {
  const c = cfg ?? { ...DEFAULT_LEAD_SCORING_CONFIG, company_id: "" };
  if (icpScore >= c.tier_a_threshold) return "A";
  if (icpScore >= c.tier_b_threshold) return "B";
  if (icpScore >= c.tier_c_threshold) return "C";
  return "D";
}
