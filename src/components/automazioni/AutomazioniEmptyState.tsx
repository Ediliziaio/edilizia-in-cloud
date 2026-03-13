import { Zap } from "lucide-react";

interface Props {
  categoria: string;
}

export function AutomazioniEmptyState({ categoria }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Zap className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">
        Nessuna automazione {categoria !== "tutte" ? `nella categoria "${categoria}"` : ""}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Crea una nuova automazione o attiva un template dalla gallery per iniziare ad automatizzare i tuoi processi.
      </p>
    </div>
  );
}
