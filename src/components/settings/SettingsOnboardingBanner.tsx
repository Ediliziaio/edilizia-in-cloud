/**
 * IMP5 — Banner onboarding progressivo nella sidebar impostazioni
 *
 * Mostra la barra di avanzamento "Setup azienda — N / 6 completati"
 * con link al prossimo step da completare.
 * Si nasconde automaticamente quando tutti gli step sono completati.
 */

import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";

export function SettingsOnboardingBanner() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const { steps, completedCount, totalCount, allDone, nextStep } = useOnboardingProgress();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("settings_onboarding_dismissed") === "1"; } catch { return false; }
  });

  // Nascosto se non admin, completato o se l'utente ha chiuso il banner
  if (!isAdmin || allDone || dismissed) return null;

  const progressPct = (completedCount / totalCount) * 100;

  const handleDismiss = () => {
    try { localStorage.setItem("settings_onboarding_dismissed", "1"); } catch { /* storage non disponibile — silenzioso */ }
    setDismissed(true);
  };

  return (
    <div className="mx-3 mb-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground">
            Setup azienda
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground -mt-0.5 -mr-0.5"
          onClick={handleDismiss}
          aria-label="Nascondi guida setup"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Barra progresso */}
      <Progress value={progressPct} className="h-1.5 mb-1.5" />

      <p className="text-xs text-muted-foreground mb-2">
        <span className="font-semibold text-foreground">{completedCount}</span> / {totalCount} completati
      </p>

      {/* Lista step con stato */}
      <div className="space-y-0.5 mb-2">
        {steps.map(step => (
          <button
            key={step.id}
            onClick={() => navigate(step.path)}
            className="flex items-center gap-2 w-full text-left rounded px-1.5 py-0.5 hover:bg-primary/10 transition-colors"
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                step.completed ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            />
            <span
              className={`text-xs truncate ${
                step.completed ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {step.label}
            </span>
          </button>
        ))}
      </div>

      {/* CTA → prossimo step */}
      {nextStep && (
        <Button
          variant="default"
          size="sm"
          className="w-full h-7 text-xs gap-1"
          onClick={() => navigate(nextStep.path)}
        >
          Continua: {nextStep.label}
          <ChevronRight className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
