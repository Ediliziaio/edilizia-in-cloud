import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, Loader2, ChevronRight, Rocket, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCompanyOnboarding, useCompleteOnboardingStep } from "@/hooks/useCompanyOnboarding";
import type { OnboardingStep } from "@/hooks/useCompanyOnboarding";

function StepRow({
  step,
  onToggle,
  isLoading,
}: {
  step: OnboardingStep;
  onToggle: (stepId: string, completed: boolean) => void;
  isLoading: boolean;
}) {
  return (
    <button
      onClick={() => onToggle(step.id, !step.completed)}
      disabled={isLoading}
      className={cn(
        "w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors",
        step.completed
          ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900"
          : "bg-background hover:bg-accent/30 border-border"
      )}
    >
      <div className="mt-0.5 shrink-0">
        {step.completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-sm font-medium", step.completed && "line-through text-muted-foreground")}>
            {step.title}
          </span>
          {step.is_required && !step.completed && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-orange-600 border-orange-300">
              Richiesto
            </Badge>
          )}
        </div>
        {step.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
    </button>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { data: onboarding, isLoading } = useCompanyOnboarding();
  const { mutate: toggleStep, isPending } = useCompleteOnboardingStep();

  const handleToggle = (stepId: string, completed: boolean) => {
    toggleStep(
      { stepId, completed },
      {
        onError: (err: any) => toast.error("Errore", { description: err.message }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-10 space-y-4 px-4">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }

  if (!onboarding) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4 text-center space-y-4">
        <Rocket className="h-12 w-12 mx-auto text-primary" />
        <h2 className="text-xl font-semibold">Nessun onboarding assegnato</h2>
        <p className="text-muted-foreground text-sm">
          Il tuo account non ha ancora una checklist di setup. Contatta il supporto per iniziare.
        </p>
        <Button onClick={() => navigate("/azienda")}>Vai alla Dashboard</Button>
      </div>
    );
  }

  const isComplete = onboarding.pct === 100;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Configurazione guidata</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Completa questi passaggi per configurare correttamente la tua area di lavoro.
        </p>
      </div>

      {/* Progress card */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {isComplete ? (
                <span className="flex items-center gap-1.5 text-green-600">
                  <Trophy className="h-4 w-4" />
                  Setup completato!
                </span>
              ) : (
                `${onboarding.completedCount} di ${onboarding.totalCount} completati`
              )}
            </span>
            <span className="text-muted-foreground font-semibold">{onboarding.pct}%</span>
          </div>
          <Progress value={onboarding.pct} className={cn("h-2", isComplete && "[&>div]:bg-green-500")} />
        </CardContent>
      </Card>

      {/* Steps */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Passaggi da completare</CardTitle>
          {!isComplete && (
            <CardDescription>
              Clicca su un passaggio per marcarlo come completato.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {onboarding.steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              onToggle={handleToggle}
              isLoading={isPending}
            />
          ))}
        </CardContent>
      </Card>

      {/* CTA */}
      {isComplete ? (
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-green-600 font-semibold">
            <CheckCircle2 className="h-5 w-5" />
            Tutto pronto! Puoi iniziare a usare la piattaforma.
          </div>
          <div>
            <Button size="lg" onClick={() => navigate("/azienda")}>
              Vai alla Dashboard
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => navigate("/azienda")} className="text-muted-foreground">
            Salta per ora
          </Button>
        </div>
      )}
    </div>
  );
}
