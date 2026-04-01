import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, ChevronRight, ChevronLeft, Rocket, Trophy, Building2, Users, HardHat, FileText, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCompanyOnboarding, useCompleteOnboardingStep } from "@/hooks/useCompanyOnboarding";
import type { OnboardingStep } from "@/hooks/useCompanyOnboarding";

// ── Wizard phases definition ──────────────────────────────────────────────────
const PHASES = [
  { id: "azienda",      label: "Azienda",       icon: Building2,  desc: "Configura i dati anagrafici e fiscali della tua azienda" },
  { id: "team",         label: "Team",           icon: Users,      desc: "Invita i tuoi collaboratori e assegna i permessi" },
  { id: "cantieri",     label: "Cantieri",       icon: HardHat,    desc: "Configura il tuo primo cantiere o ordine di lavoro" },
  { id: "documenti",    label: "Documenti",      icon: FileText,   desc: "Imposta la fatturazione e i modelli documentali" },
  { id: "integrazioni", label: "Integrazioni",   icon: Plug,       desc: "Connetti WhatsApp, Google Calendar e altri servizi" },
];

// ── Step row ──────────────────────────────────────────────────────────────────
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
      type="button"
      onClick={() => onToggle(step.id, !step.completed)}
      disabled={isLoading}
      className={cn(
        "w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors",
        step.completed
          ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900"
          : "bg-background hover:bg-accent/30 border-border",
        isLoading && "opacity-60 cursor-not-allowed"
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
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const navigate = useNavigate();
  const [currentPhase, setCurrentPhase] = useState(0);
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

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-10 space-y-4 px-4">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-2">
          {PHASES.map((_, i) => <Skeleton key={i} className="h-12 flex-1 rounded-lg" />)}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // ── No onboarding ──────────────────────────────────────────────────────────
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

  // ── Distribute steps into 5 phases ────────────────────────────────────────
  const steps = onboarding.steps;
  const totalSteps = steps.length;
  const perPhase = Math.ceil(totalSteps / PHASES.length);
  const phaseSteps = PHASES.map((_, phaseIdx) =>
    steps.slice(phaseIdx * perPhase, (phaseIdx + 1) * perPhase)
  );

  // Phase completion stats
  const phaseCompletion = phaseSteps.map((ps) => ({
    total: ps.length,
    completed: ps.filter((s) => s.completed).length,
  }));

  const isAllComplete = onboarding.pct === 100;
  const phase = PHASES[currentPhase];
  const PhaseIcon = phase.icon;
  const currentSteps = phaseSteps[currentPhase] || [];
  const currentPhaseDone = phaseCompletion[currentPhase];
  const isPhaseComplete = currentPhaseDone.total > 0 && currentPhaseDone.completed === currentPhaseDone.total;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Configurazione guidata</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Completa questi {PHASES.length} passaggi per configurare la tua area di lavoro.
        </p>
      </div>

      {/* Global progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {isAllComplete ? (
              <span className="flex items-center gap-1.5 text-green-600">
                <Trophy className="h-4 w-4" aria-hidden="true" />
                Setup completato!
              </span>
            ) : (
              `${onboarding.completedCount} di ${onboarding.totalCount} step completati`
            )}
          </span>
          <span className="text-muted-foreground font-semibold">{onboarding.pct}%</span>
        </div>
        <Progress
          value={onboarding.pct}
          className={cn("h-2", isAllComplete && "[&>div]:bg-green-500")}
          aria-label={`Progresso onboarding: ${onboarding.pct}%`}
        />
      </div>

      {/* Phase stepper */}
      <nav aria-label="Fasi di configurazione">
        <ol className="flex gap-2 overflow-x-auto pb-1">
          {PHASES.map((p, idx) => {
            const PIcon = p.icon;
            const phaseDone = phaseCompletion[idx];
            const isDone = phaseDone.total > 0 && phaseDone.completed === phaseDone.total;
            const isCurrent = idx === currentPhase;
            return (
              <li key={p.id} className="flex-1 min-w-[90px]">
                <button
                  type="button"
                  onClick={() => setCurrentPhase(idx)}
                  className={cn(
                    "w-full flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors text-center",
                    isCurrent
                      ? "border-primary bg-primary/10 text-primary"
                      : isDone
                      ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                      : "border-border hover:bg-muted text-muted-foreground"
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <div className="relative">
                    <PIcon className="h-5 w-5" aria-hidden="true" />
                    {isDone && (
                      <CheckCircle2 className="h-3 w-3 text-green-600 absolute -top-1 -right-1" aria-hidden="true" />
                    )}
                  </div>
                  <span className="text-[10px] font-medium leading-tight">{p.label}</span>
                  <span className="text-[9px] opacity-70">
                    {phaseDone.completed}/{phaseDone.total}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Current phase card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PhaseIcon className="h-5 w-5 text-primary" aria-hidden="true" />
            {phase.label}
            {isPhaseComplete && (
              <Badge className="bg-green-100 text-green-800 text-xs ml-auto">Completato</Badge>
            )}
          </CardTitle>
          <CardDescription>{phase.desc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {currentSteps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessuno step in questa fase.
            </p>
          ) : (
            currentSteps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                onToggle={handleToggle}
                isLoading={isPending}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => setCurrentPhase((p) => Math.max(0, p - 1))}
          disabled={currentPhase === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" /> Precedente
        </Button>

        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/azienda")}>
          Salta per ora
        </Button>

        {currentPhase < PHASES.length - 1 ? (
          <Button onClick={() => setCurrentPhase((p) => Math.min(PHASES.length - 1, p + 1))}>
            Prossimo <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            onClick={() => navigate("/azienda")}
            className={cn(isAllComplete && "bg-green-600 hover:bg-green-700")}
          >
            {isAllComplete ? (
              <><Trophy className="h-4 w-4 mr-1" aria-hidden="true" />Vai alla Dashboard</>
            ) : (
              "Vai alla Dashboard"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
