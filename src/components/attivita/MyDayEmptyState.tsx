import { Button } from "@/components/ui/button";
import { CheckCircle2, Plus } from "lucide-react";

export function MyDayEmptyState({ onNewTask }: { onNewTask: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center sm:py-16">
      <div className="mb-3 rounded-full bg-primary/10 p-3 sm:mb-4 sm:p-4">
        <CheckCircle2 className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-1">Nessun task per oggi!</h3>
      {/* Su mobile basta il titolo: «Nuova» sta gia' sopra, accanto alle linguette. */}
      <p className="hidden sm:block text-muted-foreground text-sm mb-6 max-w-sm">
        Hai finito tutto o non hai attività programmate per oggi. Puoi aggiungerne una nuova.
      </p>
      <Button className="hidden sm:inline-flex" onClick={onNewTask}>
        <Plus className="h-4 w-4 mr-2" />
        Aggiungi attività
      </Button>
    </div>
  );
}
