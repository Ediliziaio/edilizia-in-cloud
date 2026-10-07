/**
 * Un extra dello step Economia dei Serramenti (risparmio energetico, recupero in 10 anni): una scheda che si
 * apre con un clic e di serie sta chiusa, così il prezzo, le rate e la detrazione restano a portata di mano.
 *
 * Da chiusa dice comunque com'è messa (`stato`: «Attivo · € 140/anno»). Non tiene nessun dato: i campi e i
 * calcoli stanno in chi la usa, quindi chiuderla non cancella niente e non cambia quello che finisce nel PDF.
 */
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface Props {
  titolo: string;
  /** Telefono: il titolo corto, se quello intero non ci sta in una riga. */
  titoloBreve?: string;
  icona: ReactNode;
  /** Quello che si legge anche da chiusa, anche a telefono. Vuoto = niente da dire. */
  stato?: ReactNode;
  /** Il dettaglio dello stato, da tablet in su: a telefono si toglie per far stare il titolo. */
  statoDettaglio?: ReactNode;
  /** «verde» per una cosa accesa («Attivo»); «neutro» per un'informazione. */
  statoTono?: "verde" | "neutro";
  aperto: boolean;
  onApertoChange: (aperto: boolean) => void;
  children: ReactNode;
  className?: string;
}

export function ExtraRichiudibile({
  titolo, titoloBreve, icona, stato, statoDettaglio, statoTono = "verde", aperto, onApertoChange, children, className,
}: Props) {
  return (
    <Collapsible
      open={aperto}
      onOpenChange={onApertoChange}
      className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left max-md:px-3 md:min-h-10"
        >
          <span className="shrink-0 text-slate-700">{icona}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {titoloBreve ? (
              <>
                <span className="sm:hidden">{titoloBreve}</span>
                <span className="max-sm:hidden">{titolo}</span>
              </>
            ) : titolo}
          </span>
          {stato || statoDettaglio ? (
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                statoTono === "verde"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-50 text-slate-700",
                // Senza stato il solo dettaglio è la targhetta: a telefono non c'è posto.
                !stato && "max-sm:hidden",
              )}
            >
              {stato}
              {statoDettaglio ? <span className={stato ? "max-sm:hidden" : undefined}>{stato ? " · " : ""}{statoDettaglio}</span> : null}
            </span>
          ) : (
            <span className="shrink-0 text-[11px] text-muted-foreground max-sm:hidden">Facoltativo</span>
          )}
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", aperto && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t px-4 py-3 max-md:px-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
