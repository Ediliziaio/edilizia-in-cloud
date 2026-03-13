import { Clock } from "lucide-react";

export function WorkflowCronologia() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Clock className="h-10 w-10 opacity-30" />
      <h2 className="text-sm font-semibold">Cronologia Iscrizioni</h2>
      <p className="text-xs max-w-sm text-center">
        Visualizza lo storico delle iscrizioni al workflow: contatti entrati, completati e attualmente in corso.
      </p>
    </div>
  );
}
