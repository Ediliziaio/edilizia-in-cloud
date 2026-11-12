import { useAspettoOperativo } from "./generali/design/ContestoOperativo";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VoceContatore { chiave: string; etichetta: string; valore: number; avviso?: boolean }

/** I numeri in cima alle viste dei materiali: si leggono a colpo d'occhio e un clic filtra l'elenco sotto. */
export function ContatoriFiltro({ voci, attivo, onScegli, etichetta, className }: {
  voci: VoceContatore[]; attivo: string | null; onScegli: (chiave: string | null) => void; etichetta: string; className?: string;
}) {
  const aspetto = useAspettoOperativo();
  return (
    <div className={aspetto ? "generale-operativo-filters" : undefined}>
    <div role="group" aria-label={etichetta} className={cn("grid grid-cols-3 gap-1 rounded-md border bg-muted/20 p-1 sm:grid-cols-3 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none", aspetto && "generale-operativo-counters", className)}>
      {voci.map(v => (
        <button key={v.chiave} data-avviso={v.avviso && v.valore > 0 || undefined} type="button" disabled={v.valore === 0} aria-pressed={attivo === v.chiave}
          onClick={() => onScegli(attivo === v.chiave ? null : v.chiave)}
          className={cn("rounded-md border border-transparent p-2 text-left transition-colors enabled:hover:bg-accent max-sm:p-1.5", v.valore === 0 && "max-sm:hidden", attivo === v.chiave && "border-primary bg-primary/5")}>
          <span className="block text-xs text-muted-foreground">{v.etichetta}</span>
          <span className={cn("mt-1 block text-lg font-semibold tabular-nums", v.avviso && v.valore > 0 && "text-amber-700 dark:text-amber-400")}>{v.valore}</span>
        </button>
      ))}
    </div>
    {aspetto && attivo && <button type="button" className="generale-operativo-reset" onClick={() => onScegli(null)}><X aria-hidden="true" /> Mostra tutti</button>}
    </div>
  );
}
