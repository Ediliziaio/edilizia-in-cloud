import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Testata dello spazio Planimetrie; le pagine interne tornano al progetto o all'elenco. */
export function TestataPlanimetrie({ indietro, titolo, sottotitolo, azioni }: { indietro?: string; titolo: string; sottotitolo?: string; azioni?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      {indietro && <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label="Indietro">
        <Link to={indietro}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </Button>}
      <div className="min-w-0 flex-1">
        <h1 className="line-clamp-2 break-words text-2xl font-bold leading-tight text-slate-950 max-md:text-lg">{titolo}</h1>
        {sottotitolo && <p className="text-sm text-muted-foreground max-md:text-xs">{sottotitolo}</p>}
      </div>
      {azioni && <div className="flex shrink-0 flex-wrap items-center gap-2">{azioni}</div>}
    </div>
  );
}
