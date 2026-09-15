/**
 * Icona «ha già fatto richiesta» sulla scheda opportunità.
 * Vedi lib/opportunita/richiestaRipetuta.
 */
import { RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  etichettaRichiestaRipetuta,
  testoRichiestaRipetuta,
  type RichiestaRipetuta,
} from "@/lib/opportunita/richiestaRipetuta";

export function RichiestaRipetutaBadge({
  dati,
  compatta = false,
  className,
}: {
  dati: RichiestaRipetuta | null | undefined;
  /** Solo icona, per la scheda mini e le righe strette. */
  compatta?: boolean;
  className?: string;
}) {
  const testo = testoRichiestaRipetuta(dati);
  const etichetta = etichettaRichiestaRipetuta(dati);
  if (!testo || !etichetta) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={testo}
          // Toccare l'icona mostra la spiegazione, non trascina né apre la scheda.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex shrink-0 items-center gap-0.5 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-semibold leading-none text-violet-700 dark:bg-violet-950 dark:text-violet-300",
            className,
          )}
        >
          <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />
          {!compatta && <span className="whitespace-nowrap">{etichetta}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs">
        {testo}
      </TooltipContent>
    </Tooltip>
  );
}
