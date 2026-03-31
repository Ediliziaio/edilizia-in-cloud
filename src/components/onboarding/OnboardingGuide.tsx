/**
 * OnboardingGuide — Interactive step-by-step setup guide for new companies.
 * Uses onboarding_guide_steps + company_onboarding_progress tables.
 * Shows automatically for companies created within the last 30 days.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  X,
  Building2,
  ClipboardList,
  Users,
  Mail,
  Landmark,
  Receipt,
  MessageSquare,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

interface GuideStep {
  key: string;
  label: string;
  description: string | null;
  order_position: number;
  is_required: boolean;
  module: string | null;
  icon: string | null;
  route: string | null;
}

interface StepProgress {
  step_key: string;
  completed_at: string | null;
  skipped_at: string | null;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2,
  ClipboardList,
  Users,
  Mail,
  Landmark,
  Receipt,
  MessageSquare,
};

export function OnboardingGuide({ onDismiss }: { onDismiss?: () => void }) {
  const { effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const [dismissed, setDismissed] = useState(false);

  const { data: steps = [] } = useQuery<GuideStep[]>({
    queryKey: ["onboarding-guide-steps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_guide_steps" as never)
        .select("*")
        .order("order_position");
      if (error) throw error;
      return (data || []) as GuideStep[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: progress = [] } = useQuery<StepProgress[]>({
    queryKey: ["company-onboarding-progress", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_onboarding_progress" as never)
        .select("step_key, completed_at, skipped_at")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data || []) as StepProgress[];
    },
    enabled: !!companyId,
  });

  const completeMutation = useMutation({
    mutationFn: async ({ stepKey, skip = false }: { stepKey: string; skip?: boolean }) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("company_onboarding_progress" as never)
        .upsert({
          company_id: companyId!,
          step_key: stepKey,
          completed_at: skip ? null : now,
          skipped_at: skip ? now : null,
        } as never, { onConflict: "company_id,step_key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-onboarding-progress", companyId] });
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });

  if (!companyId || dismissed || steps.length === 0) return null;

  const progressMap = new Map(progress.map((p) => [p.step_key, p]));
  const completed = steps.filter((s) => progressMap.get(s.key)?.completed_at);
  const totalRequired = steps.filter((s) => s.is_required).length;
  const completedRequired = steps.filter((s) => s.is_required && progressMap.get(s.key)?.completed_at).length;
  const allRequiredDone = completedRequired === totalRequired;
  const percentage = steps.length > 0 ? Math.round((completed.length / steps.length) * 100) : 0;

  // Don't show if all required steps done and dismissed
  if (allRequiredDone && completed.length === steps.length) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {allRequiredDone ? (
              <Trophy className="h-4 w-4 text-yellow-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
            {allRequiredDone ? "Setup completato!" : "Guida alla configurazione"}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {completed.length}/{steps.length}
            </Badge>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDismiss}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Progress value={percentage} className="h-1.5" />
          <p className="text-xs text-muted-foreground">
            {percentage}% completato
            {allRequiredDone && " — tutti i passi obbligatori sono stati completati!"}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {steps.map((step) => {
          const prog = progressMap.get(step.key);
          const isCompleted = !!prog?.completed_at;
          const isSkipped = !!prog?.skipped_at;
          const Icon = ICON_MAP[step.icon || ""] || Circle;

          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                isCompleted
                  ? "bg-emerald-50 dark:bg-emerald-950/30 opacity-70"
                  : isSkipped
                  ? "opacity-40"
                  : "hover:bg-muted/50 cursor-pointer"
              }`}
              onClick={() => {
                if (!isCompleted && !isSkipped && step.route) {
                  navigate(step.route);
                }
              }}
            >
              <div className={`shrink-0 ${isCompleted ? "text-emerald-500" : "text-muted-foreground"}`}>
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                    {step.label}
                  </span>
                  {step.is_required && !isCompleted && (
                    <Badge variant="outline" className="text-[10px] h-4 border-orange-300 text-orange-600">
                      Obbligatorio
                    </Badge>
                  )}
                </div>
                {step.description && !isCompleted && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{step.description}</p>
                )}
              </div>
              {!isCompleted && !isSkipped && (
                <div className="shrink-0 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      completeMutation.mutate({ stepKey: step.key, skip: true });
                    }}
                  >
                    Salta
                  </Button>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              {isCompleted && (
                <span className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400">✓</span>
              )}
            </div>
          );
        })}

        {allRequiredDone && (
          <p className="text-xs text-center text-muted-foreground pt-1">
            Ottimo lavoro! Continua con i passi opzionali per massimizzare l'uso della piattaforma.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
