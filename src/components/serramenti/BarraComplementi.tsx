/**
 * I bottoni dei complementi, uno per tipologia del listino: «+ Tapparella»,
 * «+ Zanzariera», «+ Cassonetto», «+ Persiana». Nel box di una finestra
 * aggiungono a quella finestra; nella barra sopra la composizione, a tutte.
 */
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TipologiaListino } from "@/lib/listino/lineeListino";
import { nomeBottone } from "@/lib/serramenti/complementiFinestra";
import { cn } from "@/lib/utils";

interface Props {
  tipologie: readonly TipologiaListino[];
  onAggiungi: (tipologia: TipologiaListino) => void;
  /** Un complemento fuori listino, da scrivere sulla riga. */
  onAMano?: () => void;
  /** La tipologia che si sta aggiungendo: il suo bottone gira. */
  inCorso?: string | null;
  /** Mentre un'aggiunta è in corso, gli altri bottoni aspettano. */
  occupata?: boolean;
  /** Dove finisce, per chi legge con lo screen reader: «Alla finestra 3». */
  destinazione?: string;
  className?: string;
}

export function BarraComplementi({
  tipologie, onAggiungi, onAMano, inCorso = null, occupata = false, destinazione, className,
}: Props) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tipologie.map((t) => {
        const nome = nomeBottone(t);
        return (
          <Button
            key={t.chiave}
            type="button"
            size="sm"
            variant="outline"
            disabled={occupata}
            onClick={() => onAggiungi(t)}
            aria-label={destinazione ? `${destinazione}: aggiungi ${nome}` : `Aggiungi ${nome}`}
            className="h-7 gap-1 border-dashed border-orange-300 bg-white px-2 text-[11px] font-medium text-orange-700 hover:bg-orange-50"
          >
            {inCorso === t.chiave ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            {nome}
          </Button>
        );
      })}
      {onAMano && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={occupata}
          onClick={onAMano}
          className="h-7 gap-1 px-2 text-[11px] text-slate-600"
        >
          <Plus className="h-3 w-3" />
          {tipologie.length > 0 ? "A mano" : "Complemento a mano"}
        </Button>
      )}
    </div>
  );
}
