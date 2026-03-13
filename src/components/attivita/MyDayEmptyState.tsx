import { Button } from "@/components/ui/button";
import { CheckCircle2, Plus } from "lucide-react";

export function MyDayEmptyState({ onNewTask }: { onNewTask: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-primary/10 p-4 mb-4">
        <CheckCircle2 className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-1">Nessun task per oggi!</h3>
      <p className="text-muted-foreground text-sm mb-6 max-w-sm">
        Hai finito tutto o non hai attività programmate per oggi. Puoi aggiungerne una nuova.
      </p>
      <Button onClick={onNewTask}>
        <Plus className="h-4 w-4 mr-2" />
        Aggiungi attività
      </Button>
    </div>
  );
}
