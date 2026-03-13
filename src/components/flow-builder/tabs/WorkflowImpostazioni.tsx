import { Settings } from "lucide-react";

export function WorkflowImpostazioni() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Settings className="h-10 w-10 opacity-30" />
      <h2 className="text-sm font-semibold">Impostazioni Workflow</h2>
      <p className="text-xs max-w-sm text-center">
        Configura le impostazioni generali del workflow: nome, descrizione, categoria, orari di esecuzione e notifiche.
      </p>
    </div>
  );
}
