import { CheckCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Integration } from "@/types/integrations";

interface ActivationStepProps {
  hook: any;
  integration: Integration | null;
}

export function ActivationStep({ hook, integration }: ActivationStepProps) {
  const { selectedPages, forms } = hook;
  const activeForms = forms.filter((f: any) => f.status === "active");

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
        <Zap className="h-6 w-6" />
        <p className="font-medium text-lg">Integrazione pronta!</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <span>Account Meta collegato</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <span>{selectedPages.length} {selectedPages.length === 1 ? "pagina selezionata" : "pagine selezionate"}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <span>{activeForms.length} {activeForms.length === 1 ? "modulo attivo" : "moduli attivi"}</span>
        </div>
      </div>

      <div className="bg-muted/50 border rounded-lg p-4 space-y-2">
        <p className="text-sm font-medium">Come funziona:</p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>I nuovi lead vengono ricevuti in tempo reale via webhook</li>
          <li>Ogni lead viene mappato secondo le regole configurate</li>
          <li>I contatti vengono creati/aggiornati automaticamente nel CRM</li>
          <li>Le opportunità vengono create nella pipeline selezionata</li>
        </ul>
      </div>

      {integration?.status !== "connected" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Completa prima il collegamento OAuth per attivare la sincronizzazione.
        </p>
      )}
    </div>
  );
}
