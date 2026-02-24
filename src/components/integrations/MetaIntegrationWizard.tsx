import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Integration, MetaWizardStep } from "@/types/integrations";
import { useState, useEffect, useCallback } from "react";
import { useMetaIntegration } from "@/hooks/useMetaIntegration";
import { OAuthStep } from "./steps/OAuthStep";
import { PageSelectionStep } from "./steps/PageSelectionStep";
import { ConnectionConfirmStep } from "./steps/ConnectionConfirmStep";
import { FormListStep } from "./steps/FormListStep";
import { FieldMappingStep } from "./steps/FieldMappingStep";
import { ActivationStep } from "./steps/ActivationStep";

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
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);

  const hook = useMetaIntegration(integration);

  useEffect(() => {
    if (open) {
      setStep(isConnected ? "pages" : "oauth");
      setSelectedFormId(null);
    }
  }, [open, isConnected]);

  const currentIndex = STEP_ORDER.indexOf(step);

  const goNext = useCallback(() => {
    if (currentIndex < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[currentIndex + 1]);
    }
  }, [currentIndex]);

  const goBack = useCallback(() => {
    // From mapping, go back to forms
    if (step === "mapping") {
      setStep("forms");
      setSelectedFormId(null);
      return;
    }
    if (currentIndex > 0) {
      setStep(STEP_ORDER[currentIndex - 1]);
    }
  }, [currentIndex, step]);

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setStep(isConnected ? "pages" : "oauth");
      setSelectedFormId(null);
    }
    onOpenChange(v);
  };

  const handleOAuthSuccess = useCallback(() => {
    onComplete(); // refetch integrations
    setStep("pages");
  }, [onComplete]);

  const handleFormMapping = useCallback((formId: string) => {
    setSelectedFormId(formId);
    setStep("mapping");
  }, []);

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

        <div className="py-4 min-h-[200px]">
          {step === "oauth" && <OAuthStep onSuccess={handleOAuthSuccess} hook={hook} />}
          {step === "pages" && <PageSelectionStep hook={hook} />}
          {step === "confirm" && <ConnectionConfirmStep hook={hook} />}
          {step === "forms" && <FormListStep hook={hook} onMapFields={handleFormMapping} />}
          {step === "mapping" && selectedFormId && (
            <FieldMappingStep hook={hook} formId={selectedFormId} />
          )}
          {step === "activation" && <ActivationStep hook={hook} integration={integration} />}
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
            {step !== "oauth" && currentIndex < STEP_ORDER.length - 1 && (
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
