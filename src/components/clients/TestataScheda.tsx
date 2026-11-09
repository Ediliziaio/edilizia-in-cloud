/** La prima riga di una scheda: chi è, come raggiungerlo e, a destra, i pulsanti. */
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TestataScheda({
  onIndietro,
  etichettaIndietro,
  iniziali,
  coloreAvatar,
  nome,
  accantoAlNome,
  contatti,
  azioni,
}: {
  onIndietro: () => void;
  etichettaIndietro: string;
  iniziali: string;
  coloreAvatar: string;
  nome: string;
  /** Tipo di anagrafica e menu, subito dopo il nome. */
  accantoAlNome: ReactNode;
  contatti: ReactNode;
  /** Da computer, a destra sulla stessa riga. */
  azioni: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {/* Mobile: la freccia c'è già nella barra in alto. */}
      <Button variant="ghost" size="icon" className="-ml-2 shrink-0 max-md:hidden" onClick={onIndietro} aria-label={etichettaIndietro}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow-sm ring-2 ring-background", coloreAvatar)}>
        {iniziali}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-bold tracking-tight" title={nome}>{nome}</h1>
          {accantoAlNome}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">{contatti}</div>
      </div>
      <div className="hidden shrink-0 items-center gap-1 md:flex">{azioni}</div>
    </div>
  );
}
