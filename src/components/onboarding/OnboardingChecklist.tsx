import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { toast } from "sonner";

interface OnboardingStep {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_required: boolean;
  auto_check_key: string | null;
}

interface Completion {
  step_id: string;
}

export function OnboardingChecklist() {
  const { user, company } = useAuth();
  const queryClient = useQueryClient();
  const companyId = company?.id;

  // Get company onboarding assignment
  const { data: onboarding } = useQuery({
    queryKey: ["company-onboarding", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_onboarding" as never)
        .select("*")
        .eq("company_id", companyId as never)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const templateId = onboarding?.template_id;

  // Get steps
  const { data: steps = [] } = useQuery({
    queryKey: ["onboarding-steps", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_steps" as never)
        .select("*")
        .eq("template_id", templateId as never)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as OnboardingStep[];
    },
  });

  // Get completions
  const { data: completions = [] } = useQuery({
    queryKey: ["onboarding-completions", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_onboarding_completions" as never)
        .select("step_id")
        .eq("company_id", companyId as never);
      if (error) throw error;
      return (data || []) as unknown as Completion[];
    },
  });

  const completedIds = new Set(completions.map((c) => c.step_id));
  const pct = steps.length > 0 ? Math.round((completedIds.size / steps.length) * 100) : 0;

  const toggleStep = useMutation({
    mutationFn: async (stepId: string) => {
      if (completedIds.has(stepId)) {
        const { error } = await supabase
          .from("company_onboarding_completions" as never)
          .delete()
          .eq("company_id", companyId as never)
          .eq("step_id", stepId as never);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_onboarding_completions" as never)
          .insert({
            company_id: companyId,
            step_id: stepId,
            completed_by: user!.id,
          } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-completions", companyId] });
    },
  });

  if (!onboarding || steps.length === 0) return null;

  if (pct === 100 && onboarding.status === "completed") return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            Onboarding
          </CardTitle>
          <Badge variant={pct === 100 ? "default" : "secondary"} className="text-xs">
            {pct}% completo
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} className="h-2" />
        <div className="space-y-2">
          {steps.map((step) => {
            const done = completedIds.has(step.id);
            return (
              <button
                key={step.id}
                className={`w-full flex items-start gap-3 p-2 rounded-lg text-left transition-colors hover:bg-muted ${
                  done ? "opacity-70" : ""
                }`}
                onClick={() => toggleStep.mutate(step.id)}
              >
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                )}
                <div>
                  <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>
                    {step.title}
                  </p>
                  {step.description && (
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
