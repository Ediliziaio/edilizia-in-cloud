import { FileText } from "lucide-react";

export function WorkflowRegistro() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <FileText className="h-10 w-10 opacity-30" />
      <h2 className="text-sm font-semibold">Registro Esecuzione</h2>
      <p className="text-xs max-w-sm text-center">
        Monitora le esecuzioni del workflow in tempo reale: log dettagliati, errori e durata di ogni step.
      </p>
    </div>
  );
}
