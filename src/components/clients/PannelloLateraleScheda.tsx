/**
 * La colonna destra delle schede cliente e committente: una striscia di icone
 * sempre visibile e, accanto, il pannello della sezione scelta.
 * Il contenuto lo decide la pagina; qui ci sono solo la forma e l'apertura.
 */
import { useId, useRef, type ReactNode } from "react";
import { X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface SezioneLaterale {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** Il numero fra parentesi nel titolo; senza, niente parentesi. */
  conteggio?: number;
  /** Per i contenuti che in 340 px non stanno: si allarga dove c'è spazio. */
  larga?: boolean;
}

export function PannelloLateraleScheda({
  sezioni,
  attiva,
  onCambia,
  children,
}: {
  sezioni: SezioneLaterale[];
  attiva: string | null;
  onCambia: (key: string | null) => void;
  /** Il contenuto della sezione attiva. */
  children: ReactNode;
}) {
  const sezione = sezioni.find((s) => s.key === attiva);
  const panelId = useId();
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="hidden lg:flex shrink-0">
      {attiva && (
        <div id={panelId} role="region" aria-labelledby={`${panelId}-titolo`} className={cn(
          "w-[340px] rounded-2xl border bg-card shadow-sm flex flex-col overflow-hidden mr-2",
          sezione?.larga && "xl:w-[420px] 2xl:w-[560px]",
        )}>
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <h3 id={`${panelId}-titolo`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              {sezione?.label ?? "Pannello"}
              {sezione?.conteggio !== undefined && (
                <span className="text-[10px] tabular-nums text-muted-foreground/70">({sezione.conteggio})</span>
              )}
            </h3>
            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-6 md:w-6" onClick={() => { activeButtonRef.current?.focus(); onCambia(null); }} aria-label="Chiudi pannello">
              <XIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">{children}</div>
        </div>
      )}

      <div className="w-10 rounded-2xl border bg-muted/30 flex flex-col items-center py-2 gap-1 shrink-0">
        {sezioni.map((s) => {
          const Icon = s.icon;
          const accesa = attiva === s.key;
          return (
            <Tooltip key={s.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  ref={accesa ? activeButtonRef : undefined}
                  aria-expanded={accesa}
                  aria-controls={accesa ? panelId : undefined}
                  className={cn(
                    "h-8 w-8 rounded flex items-center justify-center transition-colors",
                    accesa ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => onCambia(accesa ? null : s.key)}
                  aria-label={s.label}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{s.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
