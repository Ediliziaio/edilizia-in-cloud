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
  /** Passo iniziale quando già connessi: "forms" dal menu "Moduli lead",
   *  "oauth" dal Risolvi problemi (ri-consenso permessi). Se non connessi
   *  si parte sempre dall'OAuth. */
  initialStep?: MetaWizardStep;
  /** Se true, all'apertura mostra subito la conferma di disconnessione
   *  (usato dal menu "Disconnetti" della card, che prima navigava altrove). */
  openDisconnect?: boolean;
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

export function MetaIntegrationWizard({ open, onOpenChange, integration, onComplete, initialStep, openDisconnect }: MetaIntegrationWizardProps) {
  const isConnected = integration?.status === "connected";
  // Passo di partenza: OAuth se non connessi; da connessi initialStep
  // esplicito (anche "oauth" per il ri-consenso) o il default "pages".
  const baseStep: MetaWizardStep = isConnected ? (initialStep ?? "pages") : "oauth";
  const [step, setStep] = useState<MetaWizardStep>(baseStep);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"config" | "logs">("config");
  const [dirty, setDirty] = useState(false);
  const [showUnsavedAlert, setShowUnsavedAlert] = useState(false);
  const [showDisconnectAlert, setShowDisconnectAlert] = useState(false);
  const pendingCloseRef = useRef(false);

  const hook = useMetaIntegration(integration);

  useEffect(() => {
    if (open) {
      setStep(baseStep);
      setSelectedFormId(null);
      setActiveTab("config");
      setDirty(false);
    }
  }, [open, baseStep]);

  // Se aperto in modalità "disconnetti" (dal menu della card), mostra subito
  // la conferma di disconnessione senza far cercare il pulsante all'utente.
  useEffect(() => {
    if (open && openDisconnect && isConnected) setShowDisconnectAlert(true);
  }, [open, openDisconnect, isConnected]);

  // Track dirty state on step changes beyond initial
  useEffect(() => {
    if (open && step !== "oauth" && step !== baseStep) {
      setDirty(true);
    }
  }, [step, open, baseStep]);

  const currentIndex = STEP_ORDER.indexOf(step);

  const goNext = useCallback(() => {
    // Confermata la selezione pagine: le pagine NON scelte (che possono
    // appartenere ad altri clienti dell'utente Meta che ha fatto l'OAuth)
    // vengono eliminate da questa azienda insieme ai loro token. Per
    // aggiungerne altre in futuro basta ripetere "Collega con Facebook".
    if (step === "pages") {
      hook.callProxy("purge-unselected").catch(() => {
        // best-effort: se fallisce, la RLS mostra comunque solo le selezionate
      });
    }
    if (currentIndex < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[currentIndex + 1]);
    }
  }, [currentIndex, step, hook]);

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
    setStep(baseStep);
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
    // Il callback ha appena inserito le pagine: ricarichiamo gli asset così
    // il passo "Seleziona pagine" le mostra subito (la query ha staleTime).
    hook.refetchAssets?.();
    setStep("pages");
  }, [onComplete, hook]);

  const handleFormMapping = useCallback((formId: string) => {
    setSelectedFormId(formId);
    setStep("mapping");
  }, []);

  const handleComplete = () => {
    // "Salva e chiudi": oltre a rinfrescare (onComplete) deve CHIUDERE il
    // dialog — prima restava aperto perché mancava onOpenChange(false).
    onComplete();
    doClose();
  };

  const handleDisconnect = async () => {
    await hook.disconnect.mutateAsync();
    setShowDisconnectAlert(false);
    setDirty(false);
    onComplete();
    onOpenChange(false);
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
                {integration && (
                  <div className="mb-4 rounded-lg border bg-muted/30 p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Integrazione Meta attiva</p>
                      <p className="text-xs text-muted-foreground">
                        Disconnetti solo se vuoi fermare import lead, webhook e token collegati.
                      </p>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => setShowDisconnectAlert(true)}>
                      Disconnetti Meta
                    </Button>
                  </div>
                )}

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
                    <FieldMappingStep hook={hook} formId={selectedFormId} onSaved={goNext} />
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
                      step === "mapping" ? (
                        // Sul passo mappatura si avanza SALVANDO ("Salva
                        // mappatura" dentro lo step): un "Avanti" primario qui
                        // faceva perdere silenziosamente la mappatura appena
                        // configurata.
                        <Button variant="outline" onClick={goNext}>Salta senza salvare</Button>
                      ) : (
                        <Button onClick={goNext}>Avanti</Button>
                      )
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

      <AlertDialog open={showDisconnectAlert} onOpenChange={setShowDisconnectAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnettere Meta?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione revoca le credenziali salvate, ferma il sync dei moduli Lead Ads e disattiva i moduli collegati. I lead già importati rimangono nel CRM.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} disabled={hook.disconnect.isPending}>
              {hook.disconnect.isPending ? "Disconnessione..." : "Disconnetti"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
