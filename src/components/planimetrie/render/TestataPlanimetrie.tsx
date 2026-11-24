import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Testata dello spazio Planimetrie; le pagine interne tornano al progetto o all'elenco. */
export function TestataPlanimetrie({ indietro, titolo, sottotitolo, azioni, compatta }: {
  indietro?: string; titolo: string; sottotitolo?: string; azioni?: ReactNode;
  /** Sul telefono lascia solo i pulsanti: nell'editor il titolo rubava 90 px al disegno (24/11/2026). */
  compatta?: boolean;
}) {
  const t = useT();
  return (
    <div className={`flex flex-wrap items-start gap-3${compatta ? " max-md:flex-nowrap max-md:items-center max-md:gap-1.5" : ""}`}>
      {indietro && <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label={t("Indietro")}>
        <Link to={indietro}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </Button>}
      {/* Larghezza minima del titolo: sotto, i pulsanti vanno a capo. Senza, a ~800 px
          i cinque pulsanti lo schiacciavano a «Dem / o ·…» (23/11/2026). */}
      <div className={`min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:min-w-[18rem] sm:basis-0${compatta ? " max-md:basis-auto" : ""}`}>
        <h1 className={`break-words text-2xl font-bold leading-tight text-foreground max-md:text-lg${compatta ? " line-clamp-1" : " line-clamp-2"}`}>{titolo}</h1>
        {sottotitolo && <p className={`text-sm text-muted-foreground max-md:text-xs${compatta ? " max-md:hidden" : ""}`}>{sottotitolo}</p>}
      </div>
      {azioni && <div className={`flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0${compatta ? " max-md:w-auto max-md:shrink-0 max-md:flex-nowrap" : ""}`}>{azioni}</div>}
    </div>
  );
}
