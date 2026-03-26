import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_required: boolean;
  auto_check_key: string | null;
  completed: boolean;
  completed_at: string | null;
}

export interface CompanyOnboarding {
  id: string;
  company_id: string;
  template_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  pct: number;
}

export function useCompanyOnboarding() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: ["company-onboarding", companyId],
    queryFn: async (): Promise<CompanyOnboarding | null> => {
      if (!companyId) return null;

      const { data: onboarding, error } = await supabase
        .from("company_onboarding" as never)
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle() as any;

      if (error || !onboarding) return null;

      const [stepsRes, completionsRes] = await Promise.all([
        supabase
          .from("onboarding_steps" as never)
          .select("*")
          .eq("template_id", onboarding.template_id)
          .order("sort_order") as any,
        supabase
          .from("company_onboarding_completions" as never)
          .select("step_id, completed_at")
          .eq("company_id", companyId) as any,
      ]);

      const completionMap = new Map(
        (completionsRes.data || []).map((c: any) => [c.step_id, c.completed_at])
      );

      const steps: OnboardingStep[] = (stepsRes.data || []).map((s: any) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        sort_order: s.sort_order,
        is_required: s.is_required,
        auto_check_key: s.auto_check_key,
        completed: completionMap.has(s.id),
        completed_at: completionMap.get(s.id) || null,
      }));

      const completedCount = steps.filter((s) => s.completed).length;
      const totalCount = steps.length;

      return {
        ...onboarding,
        steps,
        completedCount,
        totalCount,
        pct: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      };
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCompleteOnboardingStep() {
  const { effectiveCompany, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ stepId, completed }: { stepId: string; completed: boolean }) => {
      const companyId = effectiveCompany?.id;
      if (!companyId) throw new Error("No company");

      if (completed) {
        const { error } = await (supabase
          .from("company_onboarding_completions" as never)
          .upsert({ company_id: companyId, step_id: stepId, completed_by: user?.id, completed_at: new Date().toISOString() }, { onConflict: "company_id,step_id" }) as any);
        if (error) throw error;
      } else {
        const { error } = await (supabase
          .from("company_onboarding_completions" as never)
          .delete()
          .eq("company_id", companyId)
          .eq("step_id", stepId) as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-onboarding", effectiveCompany?.id] });
    },
  });
}
