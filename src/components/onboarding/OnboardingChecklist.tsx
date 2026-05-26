/**
 * OnboardingChecklist — v8.6.86
 *
 * Quick Start activation card mostrata nel cruscotto finché tutti gli step
 * non sono completati. Combina:
 *   - Auto-detection step completati (useOnboardingAutoComplete)
 *   - CTA "Vai →" per ogni step pendente
 *   - Progress bar visiva con %
 *   - Si nasconde automaticamente quando 100% completato
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ListChecks, ArrowRight, Sparkles } from "lucide-react";
import { useOnboardingAutoComplete } from "@/hooks/useOnboardingAutoComplete";

interface OnboardingStep {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_required: boolean;
  auto_check_key: string | null;
  action_url: string | null;
  action_label: string | null;
}

interface Completion {
  step_id: string;
}

export function OnboardingChecklist() {
  const { user, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  // Get company onboarding assignment
  const { data: onboarding } = useQuery({
    queryKey: ["company-onboarding", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("company_onboarding" as any)
        .select("*")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("company_id", companyId as any)
        .maybeSingle();
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("onboarding_steps" as any)
        .select("*")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("template_id", templateId as any)
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("company_onboarding_completions" as any)
        .select("step_id")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("company_id", companyId as any);
      if (error) throw error;
      return (data || []) as unknown as Completion[];
    },
  });

  const completedIds = new Set(completions.map((c) => c.step_id));
  const pct = steps.length > 0 ? Math.round((completedIds.size / steps.length) * 100) : 0;

  // Auto-completion engine (scrive su DB le milestone raggiunte)
  useOnboardingAutoComplete(steps, completedIds);

  // Toggle manuale (per gli step senza auto_check_key)
  const toggleStep = useMutation({
    mutationFn: async (stepId: string) => {
      // v8.6.94 — guardia auth: senza user.id non scriviamo
      if (!user?.id || !companyId) throw new Error("Sessione non disponibile");
      if (completedIds.has(stepId)) {
        const { error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("company_onboarding_completions" as any)
          .delete()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq("company_id", companyId as any)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq("step_id", stepId as any);
        if (error) throw error;
      } else {
        const { error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("company_onboarding_completions" as any)
           
          .insert({
            company_id: companyId,
            step_id: stepId,
            completed_by: user.id,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-completions", companyId] });
    },
  });

  if (!onboarding || steps.length === 0) return null;

  // Quando tutti gli step sono completati, mostriamo banner di successo
  // per 1 sessione poi la card si nasconde definitivamente
  // (status='completed' viene scritto da super-admin o mutation manuale).
  if (pct === 100 && onboarding.status === "completed") return null;

  const nextStep = steps.find(s => !completedIds.has(s.id));
  const isAllDone = pct === 100;

  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50/40 to-white dark:from-amber-950/20 dark:via-orange-950/10 dark:to-background overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
              {isAllDone ? <Sparkles className="h-4 w-4 text-white" /> : <ListChecks className="h-4 w-4 text-white" />}
            </div>
            <span>{isAllDone ? "Sei pronto!" : "Inizia in 5 minuti"}</span>
          </CardTitle>
          <Badge
            variant={isAllDone ? "default" : "secondary"}
            className={isAllDone ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            {pct}% completato
          </Badge>
        </div>
        {!isAllDone && nextStep && (
          <p className="text-xs text-muted-foreground mt-1">
            Prossimo: <strong className="text-foreground">{nextStep.title}</strong>
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} className="h-2" />
        <div className="space-y-1.5">
          {steps.map((step) => {
            const done = completedIds.has(step.id);
            return (
              <div
                key={step.id}
                className={`group flex items-start gap-3 rounded-lg p-2 transition-colors ${
                  done ? "opacity-70" : "hover:bg-muted/60"
                }`}
              >
                <button
                  className="shrink-0 mt-0.5 disabled:opacity-50"
                  onClick={() => toggleStep.mutate(step.id)}
                  disabled={toggleStep.isPending}
                  aria-label={done ? "Segna come da fare" : "Segna come completato"}
                  type="button"
                  data-allow-in-preview="true"
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>
                    {step.title}
                  </p>
                  {step.description && !done && (
                    <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  )}
                </div>
                {!done && step.action_url && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-7 text-xs border-amber-300 hover:bg-amber-100 hover:text-amber-900"
                  >
                    <Link to={step.action_url} data-allow-in-preview="true">
                      {step.action_label ?? "Vai"}
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {isAllDone && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-3 text-center">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              🎉 Hai completato il setup. Adesso sei operativo al 100%.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
