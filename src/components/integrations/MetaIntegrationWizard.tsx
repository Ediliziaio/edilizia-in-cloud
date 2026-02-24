import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Integration, MetaWizardStep } from "@/types/integrations";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface MetaIntegrationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: Integration | null;
  onComplete: () => void;
}

const STEP_TITLES: Record<MetaWizardStep, string> = {
  oauth: "Collega il tuo account Meta",
  pages: "Seleziona le pagine",
  confirm: "Collegamento completato",
  forms: "Moduli Lead Ads",
  mapping: "Mappatura campi",
  activation: "Attivazione",
};

const STEP_ORDER: MetaWizardStep[] = ["oauth", "pages", "confirm", "forms", "mapping", "activation"];

export function MetaIntegrationWizard({ open, onOpenChange, integration, onComplete }: MetaIntegrationWizardProps) {
  const isConnected = integration?.status === "connected";
  const [step, setStep] = useState<MetaWizardStep>(isConnected ? "pages" : "oauth");

  const currentIndex = STEP_ORDER.indexOf(step);

  const goNext = () => {
    if (currentIndex < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[currentIndex + 1]);
    }
  };

  const goBack = () => {
    if (currentIndex > 0) {
      setStep(STEP_ORDER[currentIndex - 1]);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      // Reset step on close
      setStep(isConnected ? "pages" : "oauth");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{STEP_TITLES[step]}</DialogTitle>
          <div className="flex items-center gap-1 pt-2">
            {STEP_ORDER.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= currentIndex ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="py-4 min-h-[200px] flex items-center justify-center">
          {step === "oauth" && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <svg viewBox="0 0 36 36" className="h-8 w-8" fill="none">
                  <rect width="36" height="36" rx="8" fill="hsl(var(--primary))" />
                  <text x="18" y="24" textAnchor="middle" fill="white" fontSize="18" fontWeight="700" fontFamily="system-ui">M</text>
                </svg>
              </div>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Collega il tuo account Facebook per importare lead dai moduli Lead Ads delle tue pagine.
              </p>
              <Button disabled className="gap-2">
                <Loader2 className="h-4 w-4" />
                Collega con Facebook
              </Button>
              <p className="text-xs text-muted-foreground">
                L'integrazione OAuth verrà implementata nella Fase 2.
              </p>
            </div>
          )}

          {step !== "oauth" && (
            <div className="text-center text-muted-foreground text-sm">
              <p>Questo step sarà implementato nella Fase 3.</p>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2 border-t">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Annulla
          </Button>
          <div className="flex gap-2">
            {currentIndex > 0 && (
              <Button variant="outline" onClick={goBack}>
                Indietro
              </Button>
            )}
            {currentIndex < STEP_ORDER.length - 1 && (
              <Button onClick={goNext}>Avanti</Button>
            )}
            {currentIndex === STEP_ORDER.length - 1 && (
              <Button onClick={onComplete}>Salva e chiudi</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
