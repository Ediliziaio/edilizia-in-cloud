import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Integration, MetaWizardStep } from "@/types/integrations";
import { useState, useEffect, useCallback, useRef } from "react";
import { useMetaIntegration } from "@/hooks/useMetaIntegration";
import { OAuthStep } from "./steps/OAuthStep";
import { PageSelectionStep } from "./steps/PageSelectionStep";
import { ConnectionConfirmStep } from "./steps/ConnectionConfirmStep";
import { FormListStep } from "./steps/FormListStep";
import { FieldMappingStep } from "./steps/FieldMappingStep";
import { ActivationStep } from "./steps/ActivationStep";
import { IntegrationLogsPanel } from "./IntegrationLogsPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [activeTab, setActiveTab] = useState<"config" | "logs">("config");
  const [dirty, setDirty] = useState(false);
  const [showUnsavedAlert, setShowUnsavedAlert] = useState(false);
  const pendingCloseRef = useRef(false);

  const hook = useMetaIntegration(integration);

  useEffect(() => {
    if (open) {
      setStep(isConnected ? "pages" : "oauth");
      setSelectedFormId(null);
      setActiveTab("config");
      setDirty(false);
    }
  }, [open, isConnected]);

  // Track dirty state on step changes beyond initial
  useEffect(() => {
    if (open && step !== "oauth" && step !== (isConnected ? "pages" : "oauth")) {
      setDirty(true);
    }
  }, [step, open, isConnected]);

  const currentIndex = STEP_ORDER.indexOf(step);

  const goNext = useCallback(() => {
    if (currentIndex < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[currentIndex + 1]);
    }
  }, [currentIndex]);

  const goBack = useCallback(() => {
    if (step === "mapping") {
      setStep("forms");
      setSelectedFormId(null);
      return;
    }
    if (currentIndex > 0) {
      setStep(STEP_ORDER[currentIndex - 1]);
    }
  }, [currentIndex, step]);

  const attemptClose = () => {
    if (dirty) {
      setShowUnsavedAlert(true);
      pendingCloseRef.current = true;
    } else {
      doClose();
    }
  };

  const doClose = () => {
    setStep(isConnected ? "pages" : "oauth");
    setSelectedFormId(null);
    setDirty(false);
    onOpenChange(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      attemptClose();
    } else {
      onOpenChange(v);
    }
  };

  const handleOAuthSuccess = useCallback(() => {
    onComplete();
    setStep("pages");
  }, [onComplete]);

  const handleFormMapping = useCallback((formId: string) => {
    setSelectedFormId(formId);
    setStep("mapping");
  }, []);

  const handleComplete = () => {
    setDirty(false);
    onComplete();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {activeTab === "logs" ? "Log eventi" : STEP_TITLES[step]}
            </DialogTitle>
          </DialogHeader>

          {isConnected && integration ? (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "config" | "logs")}>
              <TabsList className="w-full">
                <TabsTrigger value="config" className="flex-1">Configurazione</TabsTrigger>
                <TabsTrigger value="logs" className="flex-1">Log & Monitoraggio</TabsTrigger>
              </TabsList>

              <TabsContent value="config" className="mt-4">
                <div className="flex items-center gap-1 mb-4">
                  {STEP_ORDER.map((s, i) => (
                    <div
                      key={s}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i <= currentIndex ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  ))}
                </div>

                <div className="min-h-[200px]">
                  {step === "oauth" && <OAuthStep onSuccess={handleOAuthSuccess} hook={hook} />}
                  {step === "pages" && <PageSelectionStep hook={hook} />}
                  {step === "confirm" && <ConnectionConfirmStep hook={hook} />}
                  {step === "forms" && <FormListStep hook={hook} onMapFields={handleFormMapping} />}
                  {step === "mapping" && selectedFormId && (
                    <FieldMappingStep hook={hook} formId={selectedFormId} />
                  )}
                  {step === "activation" && <ActivationStep hook={hook} integration={integration} />}
                </div>

                <div className="flex justify-between pt-2 border-t mt-4">
                  <Button variant="ghost" onClick={attemptClose}>
                    Annulla
                  </Button>
                  <div className="flex gap-2">
                    {currentIndex > 0 && (
                      <Button variant="outline" onClick={goBack}>Indietro</Button>
                    )}
                    {step !== "oauth" && currentIndex < STEP_ORDER.length - 1 && (
                      <Button onClick={goNext}>Avanti</Button>
                    )}
                    {currentIndex === STEP_ORDER.length - 1 && (
                      <Button onClick={handleComplete}>Salva e chiudi</Button>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="logs" className="mt-4">
                <IntegrationLogsPanel integration={integration} />
              </TabsContent>
            </Tabs>
          ) : (
            <>
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

              <div className="py-4 min-h-[200px]">
                {step === "oauth" && <OAuthStep onSuccess={handleOAuthSuccess} hook={hook} />}
              </div>

              <div className="flex justify-between pt-2 border-t">
                <Button variant="ghost" onClick={attemptClose}>
                  Annulla
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showUnsavedAlert} onOpenChange={setShowUnsavedAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifiche non salvate</AlertDialogTitle>
            <AlertDialogDescription>
              Hai modifiche non salvate. Sei sicuro di voler chiudere senza salvare?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua a modificare</AlertDialogCancel>
            <AlertDialogAction onClick={doClose}>Chiudi senza salvare</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
